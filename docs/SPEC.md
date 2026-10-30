# SPEC.md — bid · como será construído

Complemento técnico do [PRD.md](PRD.md). Define stack, arquitetura, modelo de dados, IA, geração de contrato, assinatura, infraestrutura (nuvem) e segurança.

## Stack
- **Frontend:** React 18 + TypeScript + **Vite** (PWA, mobile first). **TanStack Query** (estado de servidor). Roteamento com React Router. Design system próprio do bid. A identidade v1.0 e o plano de adoção estão em `docs/brand/`; o aplicativo ainda utiliza os tokens anteriores do protótipo até a migração.
- **Backend / dados:** **Supabase** — Postgres, Auth, Storage, **RLS**, **Edge Functions** (Deno), e cron (pg_cron) se necessário.
- **IA:** **API da Anthropic (Claude)**, chamada **sempre no servidor** (Edge Function), nunca no cliente. Extração de propostas e equalização.
- **Geração de contrato (PDF):** serviço HTML→PDF (Playwright/Chromium) rodando como função serverless (Vercel Functions suportam Playwright) ou Edge Function dedicada; alternativa: `@react-pdf/renderer`.
- **Assinatura:** canvas (assinatura a dedo) no cliente; aplicação da imagem ao PDF no servidor; link externo tokenizado.
- **Hospedagem:** **Vercel** (app PWA + rotas de API/serverless) + **Supabase** (DB/Auth/Storage/Edge Functions). Deploy contínuo via Git.
- **Testes:** Vitest (unidade, regras de domínio) + Playwright (E2E).

## Arquitetura (visão)
```
PWA (React/Vite)
  ├─ TanStack Query  ──────────────►  Supabase (Postgres + RLS, Auth, Storage)
  ├─ Signature pad (canvas)
  └─ chamadas a /api (server)
Server (Vercel Functions / Supabase Edge Functions)
  ├─ POST /ai/extract-proposal   → Anthropic (lê PDF/planilha → JSON estruturado)
  ├─ POST /ai/equalize           → Anthropic (compara propostas → análise/recomendação)
  ├─ POST /contracts/:id/pdf     → HTML→PDF (minuta + anexos)
  ├─ POST /contracts/:id/sign    → aplica assinatura, grava PDF assinado, auditoria
  └─ GET  /sign/:token           → página/estado de assinatura externa (link WhatsApp)
```
Princípio: **regra de domínio pura e testada** (cálculos de equalização, status, variação entre versões, textos de cláusula) fica em um pacote/módulo isolado (`core`), importado por telas e servidor; nenhuma tela recalcula por conta própria.

## Modelo de dados (Postgres)
Todas as tabelas: `id uuid pk`, `created_at`, `updated_at`, `deleted_at` (exclusão lógica). RLS por organização/usuário.

- **obras** — `nome`, `cidade`, `fase`, `fase_pill`.
- **certames** (tomada de preços) — `obra_id`, `categoria` (texto livre), `titulo`, `escopo`, `status` ∈ {aberta, analise, adjudicada}, `abertura`, `limite`, `vencedora_proposta_id` (nullable).
- **propostas** — `certame_id`, `fornecedor` (texto), `status` ∈ {recebida, analise, vencedora, desclassificada}, `valor_atual`, `prazo_atual`, `condicao_pagamento`, `garantia`, `versao_atual` (int).
- **proposta_versoes** — `proposta_id`, `n` (int), `data`, `valor`, `prazo`, `condicao_pagamento`, `garantia`, `obs`, `arquivo_path` (Storage), `dados_extraidos` (jsonb — saída bruta da IA).
- **equalizacoes** — `escopo` ∈ {obra, entre_obras}, `categoria`, `certame_id` (nullable p/ entre_obras), `proposta_ids` (uuid[]), `resultado_ia` (jsonb: veredito, achados, recomendação), `criado_por`.
- **contratos** — `certame_id`, `proposta_id` (vencedora), `obra_id`, `categoria`, `valor`, `status` ∈ {rascunho, enviado, assinado}, `pdf_path`, `paginas` (int).
- **contrato_clausulas** — `contrato_id`, `numero`, `titulo`, `texto`, `origem` (ex.: "proposta v2" | "modelo"). (Ou template + overrides em jsonb.)
- **assinaturas** — `contrato_id`, `parte` ∈ {contratante, contratada}, `signatario_nome`, `assinatura_img_path`, `via` ∈ {app, link}, `token` (p/ link), `assinado_em`, `ip`, `user_agent`, `doc_hash`.
- **sugestoes** — `tipo` ∈ {categoria, fornecedor, obra, local}, `texto`, `uso` (int). Autocomplete ordenado por uso.
- **eventos** — `entidade`, `entidade_id`, `tipo`, `payload` (jsonb), `autor`. Auditoria.

### Estados e transições
- Certame: `aberta` → `analise` (quando começa a equalizar) → `adjudicada` (quando há vencedora). Vencedora direta pula de `aberta/analise` para `adjudicada`.
- Proposta: `recebida` → `analise` → `vencedora` | `desclassificada`.
- Contrato: `rascunho` → `enviado` (link gerado) → `assinado` (as duas partes).

## Integração com a Anthropic (Claude)
Chaves **apenas** no servidor (`ANTHROPIC_API_KEY`).

### Extração de proposta (`/ai/extract-proposal`)
- Entrada: arquivo (PDF/planilha) + obra + categoria.
- Claude recebe o **PDF como documento** (Messages API, bloco `document`) e retorna **JSON estruturado**: `{ fornecedor, valor, prazo_dias, condicao_pagamento, garantia, itens:[{descricao, qtd, unit, total}], observacoes }`.
- Usar **saída estruturada** (tool/JSON schema). Modelo sugerido: **`claude-sonnet-5-5`** (equilíbrio); para extração simples, **`claude-haiku-5-5`**. Model id configurável por env.
- O resultado é mostrado para **conferência** antes de salvar (nunca grava sem o usuário confirmar).

### Equalização (`/ai/equalize`)
- Entrada: conjunto de propostas (dados + arquivos) de um certame (ou entre obras).
- Claude normaliza escopos, identifica itens faltantes, estima impacto de itens não inclusos (ex.: transporte) e recomenda a melhor proposta com justificativa. Saída `jsonb` (veredito, achados por proposta, recomendação).
- Modelo sugerido: **`claude-sonnet-5-5`**; **`claude-opus-5-5`** para casos complexos. Salvar em `equalizacoes.resultado_ia`.

> Boas práticas: enviar só o necessário, usar prompt caching quando aplicável, tratar timeouts e exibir estado "lendo…". A recomendação é apoio; a decisão é do usuário.

## Geração do contrato
- Template de minuta (HTML) + dados da proposta vencedora → **cláusulas pré-preenchidas** (objeto, preço/pagamento, prazo, garantia) e cláusulas padrão editáveis.
- Render **HTML→PDF** no servidor; grava em Storage (`contratos/{id}.pdf`), com `paginas` detectado.
- Anexos: proposta vencedora (arquivo original) e equalização (export).

## Assinatura digital
- **No app:** canvas captura a assinatura (imagem PNG transparente). Enviada ao servidor, que a **aplica em todas as páginas** do PDF (posição configurável por parte) e regrava o PDF.
- **Externa (link):** `GET /sign/:token` abre uma página mínima (pode ser rota do próprio PWA) com resumo do documento e o quadro de assinatura. Ao confirmar, mesma rotina de aplicação.
- **Compartilhar:** botão gera link e abre `https://wa.me/?text=...` com o link.
- **Auditoria:** cada assinatura grava `assinado_em`, `ip`, `user_agent`, `doc_hash` (hash do PDF no momento). Quando as duas partes assinam, `contratos.status = assinado`.
- **Segurança do link:** token aleatório de uso único por parte, com expiração; invalida após assinar.

## Infraestrutura / nuvem
- **Vercel:** hospeda o PWA e as funções de API (extract, equalize, pdf, sign). Variáveis: `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE` (server), `SUPABASE_ANON_KEY` (client). Timeout de função adequado para PDF/IA.
- **Supabase:** Postgres + RLS, Auth (e-mail/magic link), Storage (buckets `propostas`, `contratos`, `assinaturas` — privados, acesso via URLs assinadas), Edge Functions (opcional para webhooks/cron).
- **Ambientes:** `preview` (branches) e `production`. Seeds de homologação só fora de produção.
- **Segredos:** nunca no cliente; chave da Anthropic só no servidor.

## Segurança e privacidade
- RLS em todas as tabelas; teste de política no mesmo PR da migration.
- Arquivos em buckets privados; download por URL assinada temporária.
- Link de assinatura: token forte, expira, uso único, escopo a um contrato.
- LGPD: dados de fornecedores e signatários tratados como pessoais; auditoria registra o mínimo necessário.

## Performance
- Abrir o acervo e um certame < 1,5 s em 4G: buscar o agregado em uma consulta e calcular derivados no cliente com o `core`.
- Sem N+1 em listas; paginar históricos.
- Comprimir imagens de assinatura; upload de arquivos em segundo plano.

## Estrutura de repositório (proposta)
```
/apps/web            PWA (rotas, telas, componentes)
/apps/api            funções de servidor (extract, equalize, pdf, sign)  [ou /api no Vercel]
/packages/core       regras de domínio puras e testadas (equalização, status, versões, cláusulas)
/packages/ui         tokens bid e componentes base
/supabase            migrations, policies (RLS), seed, functions
/docs                PRD.md, SPEC.md, PLAN.md, prototipo-bid.html
```
