# PLAN.md — bid · ordem de execução por milestones

Ordem de implementação, do fundamento ao fim do fluxo, seguindo a hierarquia de prioridades do produto. Cada milestone tem checklist e critério de aceite. Marque os itens e registre desvios em **Decisões**.

Regra geral: um item por commit (mensagem em pt-BR no imperativo); migration sempre com RLS e teste de política no mesmo PR; regra de domínio só em `packages/core` com teste.

---

## M0 · Fundação do projeto ✅
- [x] Monorepo (web, core, ui, supabase) + Vite + TypeScript + PWA.
- [x] Supabase: projeto criado, Auth (link mágico) **funcionando no app em produção**. Buckets privados + RLS por dono estão como migration (`20261029120000_init_storage.sql`), a **aplicar no banco** quando o Storage for usado (M2).
- [x] CI (lint, typecheck, testes) **verde no GitHub Actions** e **deploy na Vercel** (produção no ar, deploy automático por push).
- [x] Design system bid em `packages/ui` (tokens índigo, componentes base, logomarca de propostas empilhadas em 3D).
- **Aceite:** ✅ **Atingido.** App no ar em produção (`https://web-virid-eta-1bu3ht1oue.vercel.app`), login por link mágico funcionando, CI verde. Pendências não-bloqueantes: aplicar a migration de Storage, `service_role` + `ANTHROPIC_API_KEY` (M2), renomear o projeto Vercel `web`→`bid`, repo voltar a privado quando o billing do Actions for ajustado.

## M1 · Acervo de propostas (prioridade 1)
- [ ] Modelo de dados: `obras`, `certames`, `propostas`, `proposta_versoes`, `sugestoes`, `eventos` (+ RLS).
- [ ] Tela **Propostas** (acervo): busca, filtro por categoria (campo livre) e escopo (todo o sistema / por obra).
- [ ] Autocomplete por `sugestoes` (categoria, fornecedor, obra).
- [ ] Tela **Obras** e **Obra** (organizador).
- [ ] Seed de homologação.
- **Aceite:** navegar o acervo, buscar e filtrar; listas sem N+1; abrir obra.

## M2 · Nova proposta com extração por IA (prioridade 1)
- [x] Upload de arquivo (PDF/planilha) para Storage (bucket `propostas`, pasta do usuário; limites de tamanho/mime).
- [x] Função `/ai/extract-proposal` (Anthropic) → JSON estruturado; tela mostra "lendo…" e o cartão de conferência.
- [x] Salvar proposta + 1ª versão com `dados_extraidos` e arquivo (reaproveita/cria certame por obra+categoria).
- [x] Botão de criar discreto no topo à direita (aba Propostas).
- **Aceite:** informar obra + categoria, anexar arquivo, a IA preenche os dados, o usuário confere e arquiva; a proposta aparece no acervo. _(Fluxo e UI prontos; a extração ponta a ponta exige `ANTHROPIC_API_KEY` no servidor — verificação no preview da Vercel após provisionar.)_

## M3 · Controle de versões (prioridade 2)
- [x] Nova versão de uma proposta (novo arquivo + extração + histórico) via RPC atômico `criar_versao`.
- [x] Tela da proposta (`/propostas/:id`): linha do tempo de versões, variação de valor/prazo, download dos arquivos originais (URL assinada).
- [x] Equalização **entre versões** de uma proposta (diff client-side de valor/prazo/condições; a IA é M4).
- **Aceite:** revisar uma proposta mantém o histórico; comparar duas versões mostra o que mudou. _(Revisão com arquivo PDF exige `ANTHROPIC_API_KEY`; o preenchimento manual funciona sem chave.)_

## M4 · Equalização (prioridade 3)
- [x] `core`: comparativo (menor/maior valor e prazo, economia potencial) + normalização da análise IA — testados.
- [x] Tela **Equalizar** (lista por estado) + **Iniciar equalização** (escopo, categoria, seleção de propostas).
- [x] Comparativo lado a lado + função `/ai/equalize` (análise e recomendação) salva em `equalizacoes.resultado_ia`.
- [x] Equalização **entre obras** (mesma categoria, N obras).
- **Aceite:** comparar um certame com várias propostas, rodar a IA e ver recomendação com justificativa; comparar a mesma categoria entre obras. _(Comparativo lado a lado funciona sem chave; a recomendação da IA exige `ANTHROPIC_API_KEY` no servidor.)_

## M5 · Vencedora (prioridade 4a)
- [x] Definir vencedora pela equalização (botão em cada proposta do comparativo).
- [x] **Definir vencedora direto na proposta** (sem equalizar), incl. caso de proposta única; adjudica o certame.
- [x] "Desfazer" (toast de 5s) ao definir vencedora; eventos de auditoria (`vencedora_definida`/`_desfeita`).
- **Aceite:** marcar vencedora pelos dois caminhos; status e certame atualizam; disponível para contrato (M6).

## M6 · Contrato a partir da vencedora (prioridade 4b)
- [x] Gerar contrato vinculando a proposta vencedora (certame/obra/valor).
- [x] Cláusulas pré-preenchidas (objeto, preço, prazo, garantia) + cláusulas padrão editáveis.
- [x] Render HTML→PDF no servidor (`@react-pdf/renderer`), gravar em Storage (pdf_path/paginas).
- [x] Criar contrato a partir de: proposta vencedora (botão) e "+" em Contratos (escolher vencedora).
- **Aceite:** gerar um contrato de uma vencedora, com dados corretos e PDF baixável. _(A geração do PDF exige as env de servidor `SUPABASE_URL`/`SUPABASE_ANON_KEY` na Vercel; a criação do contrato e a edição de cláusulas funcionam sem elas.)_

## M7 · Assinatura digital (prioridade 4c)
- [x] Assinatura **no app**: canvas (a dedo), aplicada em todas as páginas do PDF (`pdf-lib`).
- [x] **Enviar para assinatura**: link tokenizado + compartilhar por WhatsApp.
- [x] Página de assinatura externa (`/sign/:token`, pública): resumo + assinatura + confirmação.
- [x] Trilha de auditoria (data/hora, IP, user agent, doc_hash) **server-authoritative**; contrato vira **Assinado** quando as duas partes assinam.
- **Aceite:** assinar pelos dois caminhos; documento assinado no app; auditoria registrada; token uso único/expira. _(O link externo exige `SUPABASE_SERVICE_ROLE_KEY` no servidor — code-complete, inativo até provisionar; a assinatura no app também grava a trilha via service_role.)_

### Decisões de revisão (M7) — independente
Revisão independente (0 crítico/alto, 2 médio, 3 baixo): **integridade** — a assinatura só é aplicada se o PDF atual bater com o `doc_hash` da assinatura anterior (detecta adulteração entre assinaturas); PDF do contrato é **server-only** (policies de escrita de cliente removidas; `/api/contracts/pdf` grava via `service_role` e recusa se já assinado); contrato criado **só via RPC** (`criar_contrato` SECURITY DEFINER + is_member; INSERT de cliente removido). **Robustez do link**: o token é **revertido** se a assinatura falhar (não morre em falha transitória). **Corrida**: evento `contrato_assinado` só na transição real; a regravação concorrente do PDF por ambas as partes ao mesmo tempo é limitação conhecida da assinatura simples (raro: contratante no app, contratada por link). Link externo restrito à **contratada**. Baixos (doc_hash intermediário; `valor` visível na página pública de assinatura) aceitos no modelo simples (regra #9). O retorno do token em claro ao membro que gera o link é **intencional** (ele envia ao fornecedor) — vínculo de identidade/OTP é modelo ICP, fora de escopo (regra #9); o gerador fica auditado.

### Decisões de revisão (M7)
Revisão de commit endureceu a trilha (achados HIGH): escrita de `assinaturas` é **só do servidor** (sem INSERT/UPDATE de cliente); token guardado como **hash** (claro sai 1x do RPC); no app só se assina como **contratante** (fornecedor via link); caminho do PDF **derivado no servidor**; token reivindicado **atomicamente** (uso único sem corrida); `status`/`pdf_path`/`valor` do contrato são **server-only** (trigger); cláusulas não editam após haver assinatura; auditoria de quem gerou o token. Modelo é **assinatura eletrônica simples** (regra #9; ICP/vínculo de identidade fora de escopo).

## M8 · Polimento e offline (desejável)

### Decisão de identidade · 30/10/2026

- [x] Documentar a nova marca minimalista aprovada: duas folhas sobrepostas, lettering com corte no “d”, índigo profundo e marfim; fonte Sora para interface.
- [x] Criar manual PDF, guidelines editáveis, vetores, catálogo visual, tokens claro/escuro e especificação do design system em `docs/brand/`.
- [ ] Migrar `packages/ui`, login, ícones PWA e telas para a nova identidade, com validação visual e acessibilidade. A entrega do manual não marca essa migração como concluída.

Os registros históricos de M0 descrevem a marca anterior. A referência para a nova identidade é `docs/brand/README.md`.

### Itens de produto
- [ ] Ações otimistas + fila offline (upload em segundo plano).
- [ ] "Desfazer" nas ações destrutivas; estados de erro claros.
- [ ] Acessibilidade (alvos ≥ 44px, contraste AA, foco visível) e PWA instalável.
- **Aceite:** app utilizável em campo com rede ruim; sem perda de dados.

---

## Decisões
- 30/10/2026 (fidelidade ao protótipo) — **Matriz de escopo na equalização**: o comparativo virou **tabela horizontal** (itens×propostas) com a **matriz de escopo** (✓/✗/~) por proposta, além do rodapé prazo/pagamento/garantia/total e do destaque menor/maior. A matriz **vem da análise da IA** (`/ai/equalize`): a saída de `analisarEqualizacao` ganhou o campo `escopo { itens, porProposta[{proposta_id, status[]}] }` (schema + prompt + `normalizarAnalise` no `core`, testado — regra #1), persistido em `equalizacoes.resultado_ia` (jsonb, sem migration). A escolha da **vencedora** continua acessível pela tabela (ação por proposta). PRD/SPEC atualizados. O **Anexo II (equalização) no contrato** fica para depois (já existe uma versão condicional no detalhe do contrato, a partir do `certameId`).
- 30/10/2026 (auto — M7) — **Assinatura eletrônica simples** (regra #9): tabela `assinaturas` (partes `contratante`/`contratada`, `via` app/link, `token` de uso único com expiração, trilha `assinado_em`/`ip`/`user_agent`/`doc_hash`). Aplicação da assinatura ao PDF com **`pdf-lib`** (carimbo em todas as páginas, posição por parte); o PDF assinado regrava o objeto do contrato. Contrato vira **assinado** quando **ambas** as partes assinam (`core.ambasPartesAssinaram`, testado). Compartilhamento por `wa.me` (`core.linkWhatsApp`).
- 30/10/2026 (auto — M7) — **Dois caminhos**: (a) **no app** — função `/api/contracts/sign` com cliente **user-scoped** (assinante logado, RLS vale); (b) **link externo** `/sign/:token` — função `/api/sign/[token]` com **`service_role`** (assinante sem login não passa RLS). O link externo fica **code-complete porém inativo** até a `SUPABASE_SERVICE_ROLE_KEY` ser provisionada (bloqueio externo real). Token aleatório (`pgcrypto`), uso único, expira; invalida ao assinar.
- 30/10/2026 (revisão — M6) — Correções da revisão independente (2 médio, 3 baixo): o PDF do contrato passou a **org-scoped e determinístico** (`{org}/contrato-{id}.pdf`), com policies de storage por `is_member` (membro da org baixa o PDF do colega; substitui o SELECT owner-scoped do M0 e elimina órfãos ao regerar); **um contrato por proposta** (índice único parcial + RPC idempotente que devolve o existente), com a lista de vencedoras filtrando as já contratadas; aviso de "PDF desatualizado" ao editar cláusula. Contagem de páginas fica como aproximação (heurística sobre os bytes do PDF).
- 30/10/2026 (auto — M6) — **Contrato derivado da vencedora**: tabelas `contratos` + `contrato_clausulas`; RPC `criar_contrato(proposta, clausulas)` atômico exige certame **adjudicado** e a proposta ser a **vencedora**, fixa `valor` do contrato a partir da proposta (autoritativo), insere as cláusulas e grava evento. As **cláusulas** (objeto/preço/prazo/garantia + padrão) são geradas no `core` (`gerarClausulas`, testado — regra #1); editar o contrato não altera a proposta (regra #8).
- 30/10/2026 (auto — M6) — **HTML→PDF no servidor com `@react-pdf/renderer`** (JS puro, serverless-friendly, sem Chromium) em `/api/contracts/pdf`; upload ao bucket privado `contratos` com **cliente user-scoped** (nova policy de INSERT por pasta do usuário), **sem `service_role`** (mesmo padrão do M2). Grava `pdf_path` e `paginas`; download por URL assinada.
- 30/10/2026 (revisão — M5) — Correções da revisão independente (1 alto, 3 médio, 2 baixo; recomendação era BLOCK): `definir_vencedora` **rebaixa a vencedora anterior** ao trocar (vencedora única por certame — fecha o furo de dupla vencedora); `desfazer_vencedora` só reverte quando a proposta **é a vencedora corrente** (guarda por `row_count`, não só pelo enum do cliente), trata `unique_violation` (colisão com certame ativo) com mensagem clara e só grava evento se mudou; o Desfazer no cliente usa chamada crua + invalidação pelo queryClient global (**sobrevive à navegação**) e **toast de falha**; timer do toast com cleanup no unmount; a UI mostra "Vencedora" e esconde o botão na proposta já vencedora; teste pgTAP agora é **comportamental** (definir → trocar → desfazer, com asserts de estado/evento).
- 30/10/2026 (auto — M5) — **Vencedora por RPC atômico** `definir_vencedora(proposta)`: marca a proposta `vencedora`, o certame `adjudicada` + `vencedora_proposta_id` e grava evento; devolve os estados anteriores para o **Desfazer** (`desfazer_vencedora`, toast de 5s — regra #11). As demais propostas do certame **não** mudam de status (reversível, não destrutivo). Dois caminhos de UI: direto no detalhe da proposta (inclui proposta única) e no card da equalização.
- 30/10/2026 (revisão — M4) — Correções da revisão independente (0 crítico/alto, 2 médio, 4 baixo): o RPC `criar_equalizacao` passa a **amarrar as propostas ao escopo** (escopo obra → todas do certame; entre_obras → todas da categoria), fechando o furo intra-org; o banner de recomendação da IA só aparece quando aponta uma **proposta comparada** (id validado no core), com o fornecedor resolvido da proposta; `/ai/equalize` valida **≥2 propostas acessíveis** após o fetch e grava **evento `equalizacao_analisada`** (regra #10); empate TOTAL de valor/prazo não marca menor/maior (evita ruído); o comparativo preserva a **ordem de seleção** (`proposta_ids`). Sem vazamento entre orgs nem exposição de segredo.
- 30/10/2026 (auto — M4) — **Comparativo lado a lado = client-side** com `core.compararPropostas` (menor/maior valor e prazo, economia potencial; nulos ignorados; só marca extremo com ≥2 bases). A **análise/recomendação por IA** (`/ai/equalize`) é **apoio opcional**, roda no servidor e grava em `equalizacoes.resultado_ia` — nunca decide sozinha (regra #6).
- 30/10/2026 (auto — M4) — **Tabela `equalizacoes`** (SPEC): `escopo` ∈ {obra, entre_obras}, `categoria`, `certame_id` (nulo p/ entre_obras), `proposta_ids uuid[]`, `resultado_ia jsonb`, `criado_por`. Criada por **RPC `criar_equalizacao`** atômico (valida que as propostas são todas da org via RLS; para escopo obra exige certame e o move de `aberta`→`analise`; grava evento). RLS por org, soft-delete, `criado_por`/org imutáveis.
- 30/10/2026 (auto — M4) — **Iniciar equalização**: escopo (uma obra ou entre obras) + categoria + seleção de propostas. Entre obras reúne propostas da mesma categoria de N obras (histórico de preços). Ação discreta no topo da aba Equalizar.
- 30/10/2026 (revisão — M3) — Correções da revisão independente (0 crítico/1 alto/4 médio/3 baixo): **evento de auditoria** gravado em `criar_versao` **e** `criar_proposta` (fecha a regra #10, que o M2 tinha adiado); **data só-data** corrigida no core (`toDate` monta `YYYY-MM-DD` em horário local — não desloca -1 dia no Brasil), com teste; **upload separado da extração** nas duas telas (upload que falha não grava versão sem arquivo); **itens preservados** na nova versão (`dados_extraidos`); **corrida de versão** devolve mensagem amigável (`unique_violation`); join da proposta filtra `deleted_at`. Aceitos como follow-up: arquivo órfão no cancelamento após upload (limpeza por job futura; Nova proposta já tem dedupe) e revisar proposta já adjudicada permitido sem bloqueio (aviso sobre contrato derivado fica para o M6).
- 30/10/2026 (auto — M3) — **Nova versão via RPC atômico** `criar_versao` (insere a versão n+1 e atualiza os campos "atuais" da proposta numa transação; histórico preservado). Reaproveita a extração por IA do M2 para preencher a revisão. Invariantes de numeração/atualização no banco; normalização pura no core.
- 30/10/2026 (auto — M3) — **"Equalizar entre versões" = comparação client-side** (diff de valor/prazo/condições entre duas versões escolhidas), com os cálculos puros do `core` (`variacao`). A equalização **por IA** (com análise) é o M4; aqui não há IA.
- 30/10/2026 (auto — M3) — **Tela da proposta** em `/propostas/:id`: linha do tempo das versões (variação de valor/prazo entre revisões), download dos arquivos originais por **URL assinada** (bucket privado), e seletor para comparar duas versões. Navegação a partir das linhas do acervo.
- 29/10/2026 (revisão — M2) — **Criação de proposta atômica via RPC**: a gravação proposta + 1ª versão + certame virou o RPC transacional `criar_proposta` (SECURITY INVOKER, RLS vale). Resolve achados da revisão independente: escrita não atômica (proposta órfã) e corrida de certame. Um **índice único parcial** (`uq_certame_ativo_obra_categoria`) garante no máximo um certame ativo por obra+categoria. Atomicidade/corrida só se resolvem no banco, então as **invariantes de escrita** moram no RPC; o `core` mantém as **normalizações puras** (reaproveitadas no caminho de gravação manual — regra #1). Revisão: aprovada com ressalvas, 0 crítico/1 alto/2 médio corrigidos; baixos (path posicional, arquivo órfão) mitigados/anotados.
- 29/10/2026 (auto — M2) — **Wiring das funções: `/api` na raiz** (zero-config da Vercel, Root Directory = raiz). Handlers em `/api/**`, compartilhados em `/api/_lib/` (prefixo `_` não vira rota). A lógica pura de extração mora em `packages/core`. Substitui o pacote `apps/api` (sancionado pelo CLAUDE.md: "ou /api no Vercel").
- 29/10/2026 (auto — M2) — **A IA lê o arquivo via Storage**: o cliente faz upload para o bucket privado `propostas` (owner = usuário); o servidor baixa com a `service_role` e envia o PDF à Claude como bloco `document`. Evita trafegar o arquivo no corpo da requisição (limite 4,5 MB) e mantém o arquivo privado.
- 29/10/2026 (auto — M2) — **Certame na criação da proposta**: informar obra + categoria. Se já existe um certame **ativo** (não adjudicado) dessa obra+categoria, a proposta entra nele; senão cria-se um certame `aberta`. Garante que a proposta sempre caia num certame coerente e apareça no acervo.
- 29/10/2026 (auto — M2) — **Extração**: modelo `claude-haiku-5-5` (env `ANTHROPIC_MODEL_EXTRACT`), saída estruturada por **tool forçada** (`input_schema`). Normalização/validação do JSON em `core.normalizarExtracao` (testada). Conferência obrigatória: nada grava sem o usuário confirmar (regra #3); campos extraídos ficam editáveis.
- 29/10/2026 (auto — M2) — **Formatos**: extração automática por IA para **PDF** (bloco `document` nativo). Outros formatos (planilha/imagem) podem ser anexados, mas sem extração automática — o usuário preenche os campos à mão.
- 29/10/2026 (auto — M1) — **Multi-tenant por organização**: tabelas `organizacoes` e `membros`; toda tabela de domínio tem `org_id`; RLS = usuário é membro da org. Trigger em `auth.users` cria uma org pessoal + membership no primeiro login (perfil Equipe compartilha dados da org).
- 29/10/2026 (auto — M1) — **Categoria é texto livre** (sem lista fechada tipo CATS do protótipo): ícone genérico por categoria na UI + troféu para vencedora. `sugestoes` por org (tipo: categoria/fornecedor/obra/local), `uso` ordena o autocomplete.
- 29/10/2026 (auto — M1) — **Acervo**: busca e filtros no cliente sobre um fetch agregado único (sem N+1); lista ordenada por valor. Derivados calculados no cliente com o `core`.
- 29/10/2026 (auto — M1) — Tipos do banco escritos à mão em `apps/web/src/data` por enquanto (gerar via Supabase CLI depois).

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
- 29/10/2026 (infra) — GitHub: repo `LuizFPires/bid` (push por `gh`); CI do Actions estava bloqueado por billing em repo privado, então o repo está **público temporariamente** (como o `bia`) — voltar a privado depois.
- 29/10/2026 (infra) — Vercel: projeto importado do GitHub ficou com nome **`web`** e Root Directory `apps/web`; corrigido para **Root Directory = raiz** (o `vercel.json` da raiz orquestra o monorepo pnpm). Env do cliente `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` setadas (Production+Preview). Deploy automático por push ligado. Renomear `web`→`bid` fica pendente (cosmético).
