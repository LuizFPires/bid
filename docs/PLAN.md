# PLAN.md — bid · ordem de execução por milestones

Ordem de implementação, do fundamento ao fim do fluxo, seguindo a hierarquia de prioridades do produto. Cada milestone tem checklist e critério de aceite. Marque os itens e registre desvios em **Decisões**.

Regra geral: um item por commit (mensagem em pt-BR no imperativo); migration sempre com RLS e teste de política no mesmo PR; regra de domínio só em `packages/core` com teste.

---

## M0 · Fundação do projeto
- [x] Monorepo (web, core, ui, supabase) + Vite + TypeScript + PWA.
- [~] Supabase: projeto, Auth (magic link), buckets privados (`propostas`, `contratos`, `assinaturas`). — *código pronto* (config.toml, migration dos buckets + RLS por dono, login por link mágico no cliente); **aguarda o projeto Supabase (ação externa do usuário).**
- [~] CI (lint, typecheck, testes) e deploy na Vercel (preview + production). — *arquivos prontos* (`.github/workflows/ci.yml`, `vercel.json`); **aguarda GitHub + Vercel (ação externa do usuário).**
- [x] Design system bid em `packages/ui` (tokens índigo, componentes base, logomarca de propostas empilhadas em 3D).
- **Aceite:** app vazio no ar (preview), login funcionando, pipeline verde. — *Parcial:* app roda e o login renderiza localmente (preview verificado); verificação local verde (lint, typecheck, 20 testes, build PWA). O **"no ar", o pipeline verde e o login real** dependem do provisionamento externo acima.

## M1 · Acervo de propostas (prioridade 1)
- [ ] Modelo de dados: `obras`, `certames`, `propostas`, `proposta_versoes`, `sugestoes`, `eventos` (+ RLS).
- [ ] Tela **Propostas** (acervo): busca, filtro por categoria (campo livre) e escopo (todo o sistema / por obra).
- [ ] Autocomplete por `sugestoes` (categoria, fornecedor, obra).
- [ ] Tela **Obras** e **Obra** (organizador).
- [ ] Seed de homologação.
- **Aceite:** navegar o acervo, buscar e filtrar; listas sem N+1; abrir obra.

## M2 · Nova proposta com extração por IA (prioridade 1)
- [ ] Upload de arquivo (PDF/planilha) para Storage.
- [ ] Função `/ai/extract-proposal` (Anthropic) → JSON estruturado; tela mostra "lendo…" e o cartão de conferência.
- [ ] Salvar proposta + 1ª versão com `dados_extraidos` e arquivo.
- [ ] Botão de criar discreto no topo à direita.
- **Aceite:** informar obra + categoria, anexar arquivo, a IA preenche os dados, o usuário confere e arquiva; a proposta aparece no acervo.

## M3 · Controle de versões (prioridade 2)
- [ ] Nova versão de uma proposta (novo arquivo + extração + histórico).
- [ ] Tela da proposta: linha do tempo de versões, variação de valor/prazo, arquivos originais.
- [ ] Equalização **entre versões** de uma proposta.
- **Aceite:** revisar uma proposta mantém o histórico; comparar duas versões mostra o que mudou.

## M4 · Equalização (prioridade 3)
- [ ] `core`: normalização e cálculo do comparativo (itens, prazo, pagamento, garantia, total; menor/maior).
- [ ] Tela **Equalizações** (lista por estado) + **Iniciar equalização** (escopo, categoria, seleção de propostas).
- [ ] Comparativo lado a lado + função `/ai/equalize` (análise e recomendação) salva em `equalizacoes`.
- [ ] Equalização **entre obras** (mesma categoria, N obras).
- **Aceite:** comparar um certame com várias propostas, rodar a IA e ver recomendação com justificativa; comparar a mesma categoria entre obras.

## M5 · Vencedora (prioridade 4a)
- [ ] Definir vencedora pela equalização.
- [ ] **Definir vencedora direto na proposta** (sem equalizar), incl. caso de proposta única; adjudica o certame.
- [ ] "Desfazer" (toast) ao trocar vencedora; eventos de auditoria.
- **Aceite:** marcar vencedora pelos dois caminhos; status e certame atualizam; aparece disponível para contrato.

## M6 · Contrato a partir da vencedora (prioridade 4b)
- [ ] Gerar contrato vinculando a proposta (Anexo I) e a equalização (anexo).
- [ ] Cláusulas pré-preenchidas (objeto, preço, prazo, garantia) + cláusulas padrão editáveis.
- [ ] Render HTML→PDF no servidor, gravar em Storage.
- [ ] Criar contrato a partir de: proposta vencedora, certame adjudicado e "+" em Contratos.
- **Aceite:** gerar um contrato de uma vencedora, com dados corretos e PDF baixável.

## M7 · Assinatura digital (prioridade 4c)
- [ ] Assinatura **no app**: canvas (a dedo), aplicada em todas as páginas do PDF.
- [ ] **Enviar para assinatura**: link tokenizado + compartilhar por WhatsApp.
- [ ] Página de assinatura externa (`/sign/:token`): resumo + assinatura + confirmação.
- [ ] Trilha de auditoria (data/hora, IP, user agent, hash); contrato vira **Assinado** quando as duas partes assinam.
- **Aceite:** assinar pelos dois caminhos; documento aparece assinado no app; auditoria registrada; token expira/uso único.

## M8 · Polimento e offline (desejável)
- [ ] Ações otimistas + fila offline (upload em segundo plano).
- [ ] "Desfazer" nas ações destrutivas; estados de erro claros.
- [ ] Acessibilidade (alvos ≥ 44px, contraste AA, foco visível) e PWA instalável.
- **Aceite:** app utilizável em campo com rede ruim; sem perda de dados.

---

## Decisões
- 29/10/2026 — Nome do app: **bid**. Pasta do projeto: `18 BID`.
- 29/10/2026 — Logomarca: **propostas empilhadas em 3D** (três camadas), conforme protótipo.
- 29/10/2026 — Categoria de serviço é **campo livre** com autocompletar (não há cadastro fechado).
- 29/10/2026 — Nova proposta: usuário informa só **obra + categoria**; a **IA extrai o resto** do arquivo.
- 29/10/2026 — **Vencedora pode ser definida direto** na proposta, sem equalização (caso de proposta única).
- 29/10/2026 — Assinatura: **eletrônica simples** (a dedo + auditoria); ICP-Brasil fora de escopo nesta fase.
- 29/10/2026 — App é **independente do CONTRO**.
- 29/10/2026 (auto — recomendado) — **Monorepo pnpm workspaces**; TypeScript estrito; ESLint flat + Prettier; Vitest.
- 29/10/2026 (auto — recomendado) — **API em Vercel Functions** (`apps/api`), não Edge Functions, por alinhar ao deploy Vercel e evitar runtime Deno extra. Edge Functions ficam como opção para webhooks/cron.
- 29/10/2026 (auto — recomendado) — Web: **React Router v6**, **TanStack Query v5**, **vite-plugin-pwa** (autoUpdate). Fonte **Nunito Sans** via Google Fonts.
- 29/10/2026 (auto — recomendado) — Como ainda não há remote/CI, os itens do M0 foram **commits locais na `main`** (um por item). O ciclo branch→PR→CI→merge do roteiro passa a valer quando o GitHub for conectado.
- 29/10/2026 (segurança) — RLS de Storage **escopada ao dono** (`owner_id = auth.uid()`) no M0, corrigindo achado de IDOR entre inquilinos; `assinaturas` é trilha imutável só do servidor. O **escopo por organização** entra no M1 junto com o modelo de dados.
- 29/10/2026 (pendência M0) — Fronteira de API (`apps/api`) são **stubs 501**; `@anthropic-ai/sdk` e o engine HTML→PDF entram nos milestones que os usam (M2/M4/M6). Mapeamento final das funções na Vercel a definir quando o deploy for conectado (um projeto raiz vs. projeto por app).
