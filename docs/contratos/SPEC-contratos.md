# SPEC — Contratos de empreitada a partir da minuta padrão (M9–M14)

> Complementa `docs/SPEC.md`. Leia antes: `PRD-contratos.md` (regras RC-xx) e `_privado/MODELO-MINUTA.md` (dicionário de marcadores, parâmetros, blocos e variantes).
> Convenções do repo valem: regra de domínio em `packages/core` com teste; IA só no servidor; RLS + teste pgTAP no mesmo PR; exclusão lógica + `eventos`; ConfirmDialog + Desfazer.

---

## 1. Visão geral da arquitetura

```
                ┌──────────── packages/core (puro, testado) ────────────┐
 proposta ──►   │ dossie.ts      montarDossie(proposta, equalizacao, obra)│
 equalização ─► │ contrato/*.ts  parametros, clausulas, planilha, blocos, │
 cadastros ──►  │                variantes, resolver, hash, validar       │
                └───────────────┬───────────────────────────────────────┘
                                │ DocumentoResolvido (JSON canônico)
             ┌──────────────────┼───────────────────────┐
             ▼                  ▼                       ▼
 server/contrato-docx.ts   server/contrato-pdf.ts   /api/ai/revisar-contrato
 (modelo .docx + fflate)   (@react-pdf, mesmo JSON) (Claude, tool estruturada)
             │                  │
             └──► Storage `contratos/{org}/{contrato}/v{n}.docx|.pdf` (service_role)
```

Princípio: **um único `DocumentoResolvido`** (JSON canônico) gera o .docx e o PDF, e o **hash** é calculado sobre ele. Telas nunca montam texto de cláusula; chamam o core.

## 2. Modelo de dados (migrations)

Nomes sugeridos (seguir o padrão `YYYYMMDDHHMMSS_nome.sql`, depois de `20261030350000`):

| Migration | Conteúdo |
|---|---|
| `20261101100000_papeis_obra.sql` | `obra_convites.papel`, `papel_obra()`, `gerencia_obra()`, guards e RPCs de convite |
| `20261101110000_cadastros_contrato.sql` | `partes`, `parte_signatarios`, `fornecedores`, colunas novas em `obras` |
| `20261101120000_contrato_modelos.sql` | `contrato_modelos`, `modelo_blocos`, `modelo_variantes`, bucket `modelos` |
| `20261101130000_contratos_v2.sql` | colunas novas em `contratos`, `contrato_itens_clausula`, `contrato_planilha`, `contrato_blocos`, `contrato_signatarios`, numeração |
| `20261101140000_contrato_revisao_validacao.sql` | `contrato_revisoes`, `contrato_achados`, `contrato_aprovacoes`, RPCs de fluxo |
| `20261101150000_assinaturas_v2.sql` | `assinaturas` por signatário, 3 partes + testemunha |

### 2.1 Papéis por obra

```sql
alter table public.obra_convites
  add column papel text not null default 'colaborador'
  check (papel in ('gestor', 'colaborador'));
-- backfill: convites aceitos existentes ficam 'colaborador' (preserva permissões atuais)

-- 'dono' | 'gestor' | 'colaborador' | null
create or replace function public.papel_obra(p_obra uuid) returns text
language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from obras o where o.id = p_obra and o.criado_por = auth.uid() and o.deleted_at is null) then 'dono'
    else (select c.papel from obra_convites c
           where c.obra_id = p_obra and c.user_id = auth.uid() and c.status = 'aceito'
           limit 1)
  end $$;

create or replace function public.gerencia_obra(p_obra uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.papel_obra(p_obra) in ('dono', 'gestor') $$;
```

- `gerencia_contrato(p_contrato)`, `gerencia_proposta(p)`, `gerencia_certame(c)`: atalhos que resolvem a obra e chamam `gerencia_obra`.
- **Guards de exclusão** (`guard_proposta_soft_delete`, `guard_certame_soft_delete`, `apagar_equalizacao`, `apagar_contrato`): trocar "`is_gestor(org)` OU `dono_obra`" por **`gerencia_obra(obra)`**. Equalização entre obras: `gerencia_obra` de **todas** as obras envolvidas, ou quem criou.
- `apagar_obra`: continua **só dono** (Q1 do PRD).
- `convidar_para_obra(p_obra, p_email, p_papel text default 'colaborador')`: permitido a `gerencia_obra`. Gestor pode convidar gestor.
- Nova RPC `mudar_papel_obra(p_convite, p_papel)`: `gerencia_obra`; ninguém muda o dono (o dono não tem linha em `obra_convites`).
- `remover_acesso_obra`: passa a aceitar `gerencia_obra` (hoje só dono).
- `listar_acesso_obra`: devolve também `papel`; o dono aparece como `'dono'`.
- Eventos: `convite_enviado {papel}`, `papel_alterado {de, para}`.

**pgTAP (`supabase/tests/papeis_obra.test.sql`)**: dono/gestor/colaborador/estranho × {ver obra, criar proposta, apagar proposta, apagar equalização, apagar contrato, convidar, mudar papel, remover acesso, apagar obra}. Matriz completa do PRD §3.

### 2.2 Cadastros

```sql
-- obras: dados que a minuta precisa
alter table public.obras
  add column endereco text,           -- logradouro, nº, bairro, cidade/UF, CEP
  add column cno text,                -- 12 dígitos, só números
  add column foro text,               -- "Cidade/UF" (padrão: cidade da obra)
  add column contratante_id uuid,     -- references partes
  add column construtora_id uuid;     -- references partes (tipo = 'construtora')

create table public.partes (            -- CONTRATANTE e CONSTRUTORA (e futuras)
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  tipo text not null check (tipo in ('contratante', 'construtora')),
  razao_social text not null,
  nome_curto text,                    -- "SPE EXEMPLO" (usado no texto quando preenchido)
  natureza text,                      -- "sociedade empresária limitada"
  cnpj text not null,                 -- 14 dígitos
  endereco text not null, cep text,
  email text,
  marca text check (marca in ('ampla', 'classica')),   -- só construtora: define logo
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (org_id, cnpj)
);
create table public.parte_signatarios (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null, parte_id uuid not null references public.partes(id) on delete cascade,
  nome text not null, cpf text, cargo text, email text, telefone text,
  ordem int not null default 1, ativo boolean not null default true
);
create table public.fornecedores (      -- CONTRATADA
  -- mesmas colunas de partes (sem tipo/marca) + responsavel_tecnico text, crea text
  unique (org_id, cnpj)
);
create table public.fornecedor_signatarios ( /* igual a parte_signatarios */ );
```

RLS: leitura para quem `colabora_org(org_id)`; escrita de `partes` só por quem `gerencia_obra` de alguma obra da org **ou** `is_gestor(org)`; `fornecedores` podem ser criados por qualquer papel (nascem da proposta). CNPJ/CPF validados no core (`cnpjValido`, `cpfValido`) e por `check` de tamanho no banco.

### 2.3 Modelo da minuta (versionado)

```sql
create table public.contrato_modelos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  codigo text not null,               -- 'empreitada'
  versao text not null,               -- '1.0'
  docx_path text not null,            -- bucket privado `modelos`: {org}/empreitada-1.0.docx
  catalogo jsonb not null,            -- clausulas-v1.json (texto padrão de cada item)
  ativo boolean not null default false,
  created_at timestamptz not null default now(),
  unique (org_id, codigo, versao)
);
-- só uma versão ativa por (org, codigo): índice único parcial where ativo
create table public.modelo_blocos (    -- biblioteca de condições específicas
  id uuid primary key, org_id uuid not null, modelo_id uuid not null references contrato_modelos,
  chave text not null,                -- 'escavacao_escoramento'
  titulo text not null, categorias text[] not null default '{}',  -- sugere por categoria do certame
  itens_anexo jsonb not null,         -- ["texto com {{parametros}}", ...]
  altera_clausulas jsonb not null default '[]', -- [{numero:'6.3', texto:'...'}] ou [{apos:'3.6', texto:'...'}]
  parametros jsonb not null default '[]',       -- [{chave:'diesel_ref', rotulo:'Preço de referência (R$/L)', tipo:'moeda'}]
  unique (modelo_id, chave)
);
create table public.modelo_variantes (  -- catálogo de variantes negociadas
  id uuid primary key, org_id uuid not null, modelo_id uuid not null references contrato_modelos,
  chave text not null, numero text not null,     -- item afetado: '19.4'
  titulo text not null, texto text not null,
  reduz_protecao boolean not null default false,
  explicacao text not null,           -- o que a parte perde com a variante (mostrado ao aprovar)
  unique (modelo_id, chave)
);
```

Carga inicial: **script local** `scripts/seed-modelo-contrato.mjs` (usa `SUPABASE_SERVICE_ROLE_KEY` do ambiente do usuário, nunca commitado) que sobe `docs/contratos/_privado/modelo-empreitada-v1.docx` ao bucket `modelos` e insere `contrato_modelos` (catalogo = `clausulas-v1.json`), `modelo_blocos` e `modelo_variantes` a partir de `_privado/biblioteca-v1.json`. **Não** colocar texto da minuta em migration nem em `seed.sql` (repo público).

RLS: leitura por `colabora_org`; escrita só `is_gestor(org)` (administração). Bucket `modelos` privado, leitura só pelo servidor (service_role) — o cliente nunca baixa o modelo cru.

### 2.4 Contrato v2

```sql
alter table public.contratos
  drop constraint contratos_status_check,
  add constraint contratos_status_check check (status in
    ('rascunho','em_validacao','devolvido','aprovado','emitido','enviado','assinado','cancelado')),
  add column modelo_id uuid references public.contrato_modelos(id),   -- null = contrato legado (M6)
  add column numero text,                 -- 'CT-2026-007', atribuído na emissão
  add column dossie jsonb,                -- fotografia (core.Dossie), imutável após criação, exceto RPC atualizar_dossie
  add column dossie_em timestamptz,
  add column parametros jsonb not null default '{}',  -- campos do quadro e demais parâmetros (core.ParametrosContrato)
  add column partes jsonb not null default '{}',      -- snapshot de qualificação e signatários (core.PartesContrato)
  add column conteudo_hash text,          -- hash do DocumentoResolvido atual (servidor)
  add column docx_path text,              -- emitido
  add column docx_hash text, add column pdf_hash text,
  add column emitido_em timestamptz, add column emitido_por uuid,
  add column cancelado_motivo text;
create unique index uq_contrato_numero on public.contratos(org_id, numero) where numero is not null;

create table public.contrato_numeracao (org_id uuid, ano int, ultimo int not null default 0, primary key (org_id, ano));

create table public.contrato_itens_clausula (   -- substitui contrato_clausulas para contratos v2
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null, contrato_id uuid not null,
  numero text not null,                  -- '3.1', '18.1.1', '3.7' (extra) ou 'decl:4' (item do Anexo II)
  apos text,                             -- para itens extras: depois de qual número entram
  texto text not null,                   -- texto final (pode conter {{marcadores}} e **negrito**)
  texto_padrao text,                     -- texto do catálogo na versão do modelo (null p/ extra)
  origem text not null check (origem in ('padrao','parametro','proposta','bloco','variante')),
  variante_chave text,                   -- se veio do catálogo de variantes
  bloco_chave text,                      -- se veio de bloco
  suprimido boolean not null default false,  -- render "Não se aplica."
  justificativa text,                    -- obrigatória quando origem = 'variante' (check)
  reduz_protecao boolean not null default false,
  unique (contrato_id, numero),
  check (origem <> 'variante' or coalesce(length(trim(justificativa)),0) >= 10)
);
create table public.contrato_planilha (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null, contrato_id uuid not null,
  ordem int not null, codigo text, grupo boolean not null default false,
  descricao text not null, unidade text,
  quantidade numeric(18,4), preco_unitario numeric(18,4),
  total numeric(14,2)                    -- calculado no servidor: round(qtd*unit, 2); grupo = null
);
create table public.contrato_blocos (
  id uuid primary key, org_id uuid not null, contrato_id uuid not null,
  bloco_chave text not null, ordem int not null,
  itens jsonb not null,                  -- textos finais (editáveis) do Anexo I
  parametros jsonb not null default '{}',
  unique (contrato_id, bloco_chave)
);
create table public.contrato_signatarios (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null, contrato_id uuid not null,
  parte text not null check (parte in ('contratante','contratada','construtora','testemunha')),
  nome text not null, cpf text, cargo text, email text, telefone text,
  ordem int not null default 1, obrigatorio boolean not null default true
);
```

**Triggers / invariantes (servidor):**
- `block_contrato_campos_servidor` (já existe) passa a proteger também: `numero`, `conteudo_hash`, `docx_*`, `pdf_*`, `emitido_*`, `status` (só RPCs mudam), `valor`, `dossie`.
- Edição de `contrato_itens_clausula`, `contrato_planilha`, `contrato_blocos`, `contrato_signatarios`, `parametros`, `partes`: permitida só com status em (`rascunho`, `devolvido`, `aprovado`); se `aprovado`, o trigger **volta o status para `rascunho`** e marca a aprovação vigente como `superada` (RC-10).
- `valor` = soma de `contrato_planilha.total` (trigger após insert/update/delete na planilha).
- `contrato_clausulas` (legado) continua só para contratos com `modelo_id is null`.

### 2.5 Revisão IA e aprovação

```sql
create table public.contrato_revisoes (
  id uuid primary key, org_id uuid not null, contrato_id uuid not null,
  conteudo_hash text not null,           -- revisão vale para este hash
  modelo_ia text not null, resumo text,
  status text not null check (status in ('processando','concluida','falhou')),
  erro text, created_at timestamptz not null default now(), autor uuid default auth.uid()
);
create table public.contrato_achados (
  id uuid primary key, org_id uuid not null, revisao_id uuid not null references contrato_revisoes,
  tipo text not null check (tipo in ('conflito','lacuna','risco')),
  severidade text not null check (severidade in ('alta','media','baixa')),
  numero text,                           -- item do contrato afetado ('3.2', 'quadro.q_prazo', 'planilha')
  titulo text not null, explicacao text not null,
  trecho_proposta text,                  -- citação curta (≤ 300 chars)
  sugestao text,                         -- texto sugerido para o item
  resolucao text check (resolucao in ('corrigido','aceito')),
  justificativa text, resolvido_por uuid, resolvido_em timestamptz
);
create table public.contrato_aprovacoes (
  id uuid primary key, org_id uuid not null, contrato_id uuid not null,
  acao text not null check (acao in ('enviado','aprovado','devolvido')),
  conteudo_hash text not null, comentario text,
  autoaprovacao boolean not null default false,
  situacao text not null default 'vigente' check (situacao in ('vigente','superada')),
  autor uuid not null default auth.uid(), created_at timestamptz not null default now()
);
```

Escrita em `contrato_revisoes`/`contrato_achados` **só pelo servidor**, exceto os campos de resolução (via RPC `resolver_achado`).

## 3. RPCs (todas com evento em `eventos`)

| RPC | Quem | Efeito |
|---|---|---|
| `criar_contrato_v2(p_proposta, p_modelo default ativo)` | `pode_proposta` | Valida vencedora/adjudicado (como M6); cria contrato `rascunho` com `modelo_id`; **dossiê é montado pelo servidor** (rota `/api/contracts/dossie`) logo em seguida. Idempotente por proposta. |
| `atualizar_dossie(p_contrato, p_dossie jsonb)` | só service_role | grava `dossie` e `dossie_em` (rota do servidor chama) |
| `salvar_contrato(p_contrato, p_patch jsonb)` | `pode_contrato` + status editável | Upsert em lote de parâmetros, partes, itens, planilha, blocos, signatários (uma transação). Recalcula `valor`. Invalida aprovação. |
| `enviar_validacao(p_contrato, p_hash)` | `pode_contrato` | Exige: `p_hash = conteudo_hash`; revisão `concluida` para esse hash; nenhum achado `alta` sem resolução; `faltando` vazio (gravado pelo servidor em `parametros->'_faltando'`). Status → `em_validacao`. |
| `devolver_contrato(p_contrato, p_comentario)` | `gerencia_contrato` | → `devolvido`; comentário obrigatório |
| `aprovar_contrato(p_contrato, p_hash)` | `gerencia_contrato` | `p_hash` deve bater; grava aprovação (`autoaprovacao` = autor do último envio = auth.uid()); → `aprovado` |
| `emitir_contrato(p_contrato)` | só service_role (rota `/api/contracts/emitir` checa `gerencia_contrato` com o JWT do usuário antes) | Exige `aprovado` vigente com hash atual; atribui número (`contrato_numeracao` com `for update`); grava paths/hashes; → `emitido` |
| `gerar_links_assinatura(p_contrato)` | `gerencia_contrato` | Um token por signatário (hash guardado); → `enviado` |
| `cancelar_contrato(p_contrato, p_motivo)` | `gerencia_contrato` | de `emitido`/`enviado` → `cancelado` |
| `resolver_achado(p_achado, p_resolucao, p_justificativa)` | `pode_contrato` | `aceito` exige justificativa ≥ 10 chars |
| `apagar_contrato` / `restaurar_contrato` (existentes) | `gerencia_contrato` | Bloqueia `emitido`/`enviado`/`assinado`/`cancelado` |

## 4. packages/core — novos módulos (todos com teste)

```
packages/core/src/contrato/
  tipos.ts         // ParametrosContrato, PartesContrato, Signatario, ItemClausula, LinhaPlanilha, BlocoAplicado, Dossie, DocumentoResolvido, Achado
  dossie.ts        // montarDossie(extraida: PropostaExtraida, analise?: AnaliseEqualizacao, propostaId, obra): Dossie
  parametros.ts    // parametrosIniciais(dossie, obra, partes): ParametrosContrato; QUADRO: definição dos campos do quadro (rótulo, obrigatório, ajuda)
  qualificacao.ts  // qualificar(parte: ParteCadastro, papel): string   ex.: "X Ltda., sociedade..., CNPJ nº ..., com sede em ..., CEP ..., neste ato representada por A e B"
  planilha.ts      // linhasDaProposta(itens), totalLinha(qtd, unit) (round 2, HALF_UP em centavos), totalPlanilha, fmtUnit (até 4 casas), importarXlsxLinhas(rows)
  clausulas-v2.ts  // itensIniciais(catalogo, parametros, blocos): ItemClausula[]; aplicarVariante(item, variante, justificativa); suprimir(item); restaurarPadrao(item)
  blocos.ts        // sugerirBlocos(categoria, dossie): chave[]; aplicarBloco(bloco, params): {itensAnexo, alteracoes}
  resolver.ts      // resolverDocumento(contrato, modelo): DocumentoResolvido  (campos, clausulas, extras, qualificacao, declaracao, signatarios, razao, itens, blocos, anexoIII, anexos_lista)
  validar.ts       // pendencias(contrato): Pendencia[]  (campos obrigatórios, CNPJ/CPF, soma da planilha × valor, signatário por parte, variante sem justificativa, bloco de ratificação quando RC-14)
  hash.ts          // canonico(doc): string (JSON com chaves ordenadas); hashDocumento(doc) → sha256 hex (Web Crypto no cliente, node:crypto no servidor; teste garante igualdade)
  fluxo.ts         // podeAcao(status, papel, acao): boolean; STATUS_LABEL; proximoStatus
  extenso.ts       // valorExtenso(n) — portar do motor de referência (teste: 0,01; 1; 1.000; 1.000.000; 312.450,00; 2.001.001,10)
  numeracao.ts     // formatarNumero(ano, n) → 'CT-2026-007'
```

`core/status.ts` ganha os novos estados; `core/clausulas.ts` (gerarClausulas) fica para o legado.

**Casos de teste obrigatórios** (Vitest):
- `qualificar`: 1, 2 e 3 signatários ("A", "A e B", "A, B e C"); com e sem nome curto; CEP.
- `totalLinha`: 1.800 × 152,4725 = 274.450,50; 3 × 0,3333 = 1,00; grupos fora da soma.
- `resolverDocumento` com `docs/contratos/casos/caso-ficticio-01.json` → snapshot; nenhum `{{` sobrando depois do motor.
- `pendencias`: cada regra isolada.
- `hashDocumento`: mesma entrada → mesmo hash; ordem de chaves irrelevante; mudar uma vírgula muda o hash.
- `podeAcao`: matriz PRD §3 × estados PRD §6.
- `aplicarVariante` sem justificativa → erro; `reduz_protecao` propagado.

## 5. Servidor (`/api`, `packages/server`)

### 5.1 `packages/server/src/contrato-docx.ts`
Porta para TypeScript o motor de referência `docs/contratos/ref/motor-docx.mjs` (é a especificação executável — mesmos passos 1–8). Zip com **fflate** (`unzipSync`/`zipSync`, já é dependência). Troca de logo: se `construtora.marca = 'ampla'`, substitui `word/media/image1.png` pela logo AMPLA (arquivo em bucket `modelos/{org}/logo-ampla.png`). Limites: modelo ≤ 2 MB; XML ≤ 10 MB (mesma proteção do `docx.ts`).

Assinatura: `preencherDocx(modelo: Uint8Array, doc: DocumentoResolvido, opts: {final: boolean, logo?: Uint8Array}): {docx: Uint8Array, faltando: string[]}`.

Teste (Vitest em `packages/server`): roda o caso fictício contra o modelo de `_privado/` **quando existir** (`it.skipIf(!existsSync(...))`, pois o modelo não está no git); verifica `faltando = []`, ausência de `{{`, número de linhas da planilha, presença de "Não se aplica." no item suprimido, item extra 3.7 depois do 3.6, 2 blocos de assinatura da construtora.

### 5.2 `packages/server/src/contrato-pdf.ts` (decisão D3-técnica)
Vercel não tem LibreOffice; converter .docx→PDF exigiria serviço externo. **Decisão:** o PDF é renderizado com `@react-pdf/renderer` (já usado) a partir do **mesmo `DocumentoResolvido`**, imitando a minuta: cabeçalho com logo da construtora, título, quadro-resumo em tabela, partes, cláusulas com número em negrito, Anexo I (quadro + planilha + condições específicas), Anexo II, Anexo III, blocos de assinatura; fonte Sora já embarcada (`fontes-sora.ts`) ou Helvetica; rodapé "CONTRATO DE EMPREITADA • Página N". Conteúdo textual idêntico ao .docx (teste: extrair texto dos dois e comparar normalizado — cláusulas e valores). Alternativa futura: Gotenberg/serviço de conversão (registrar em Decisões se adotado).

### 5.3 Rotas

| Rota | Método | Auth | Faz |
|---|---|---|---|
| `/api/contracts/dossie` | POST `{contratoId}` | JWT usuário (RLS) para ler proposta/equalização; service_role só para `atualizar_dossie` | `core.montarDossie` + `parametrosIniciais` + cria itens/planilha/signatários iniciais via `salvar_contrato` |
| `/api/contracts/preview` | POST `{contratoId, formato:'docx'|'pdf'}` | JWT | Resolve, gera **minuta** (com aviso), devolve arquivo direto (sem gravar), grava `conteudo_hash` e `_faltando` |
| `/api/contracts/emitir` | POST `{contratoId}` | JWT (checa `gerencia_contrato`) + service_role para gravar | Gera final .docx + PDF, grava em `contratos/{org}/{id}/emitido.docx|pdf`, chama `emitir_contrato` |
| `/api/contracts/download` | GET `?id&formato` | JWT | URL assinada (60 s) do arquivo emitido (ou do PDF assinado) |
| `/api/ai/revisar-contrato` | POST `{contratoId}` | JWT | §6 |
| `/api/contracts/sign`, `/api/sign/[token]` (existentes) | | | Passam a trabalhar por **signatário** (§7) |
| `/api/contracts/pdf` (existente) | | | Mantido para contratos **legados** (`modelo_id is null`) |

Remover do PDF legado o **Anexo II de equalização** (RC-15) — mudança pequena em `pdf.ts`, só se Q3 confirmada.

## 6. Revisão por IA — `/api/ai/revisar-contrato`

- Modelo: env `ANTHROPIC_MODEL_CONTRATO` (padrão o mesmo da equalização). `max_tokens` 12k; `maxDuration` 300 s (padrão do `vercel.json` já cobre `api/**/*.ts`).
- Entrada para a IA: (1) **texto do contrato resolvido** (quadro + itens com número e origem + planilha + blocos + Anexo III), (2) **dados extraídos da proposta** + `alertas`, (3) **PDF/imagem original** da versão vencedora (mesma lógica de leitura do `/api/ai/equalize`, até 8 MB), (4) achados de escopo da equalização (`escopo` ausente/parcial, `divergencias`, `forcas_riscos` da vencedora — **sem** dados das concorrentes).
- Saída por **tool** (`tool_choice: 'auto'`, como as demais — 5.x rejeita forçado):

```json
{
  "name": "registrar_revisao",
  "input_schema": {
    "type": "object",
    "required": ["resumo", "achados"],
    "properties": {
      "resumo": { "type": "string", "description": "2–4 frases: o contrato reflete a proposta? principais pontos." },
      "achados": {
        "type": "array",
        "items": {
          "type": "object",
          "required": ["tipo", "severidade", "numero", "titulo", "explicacao"],
          "properties": {
            "tipo": { "enum": ["conflito", "lacuna", "risco"] },
            "severidade": { "enum": ["alta", "media", "baixa"] },
            "numero": { "type": "string", "description": "item do contrato: '3.2', 'quadro.q_prazo', 'planilha', 'anexo_i.bloco:<chave>'" },
            "titulo": { "type": "string" },
            "explicacao": { "type": "string", "description": "com os números dos dois lados" },
            "trecho_proposta": { "type": "string", "description": "citação literal curta da proposta" },
            "sugestao": { "type": "string", "description": "texto sugerido para o item, pronto para colar" }
          }
        }
      }
    }
  }
}
```

- **Prompt (obrigações)**: comparar SEMPRE, campo a campo, quadro × proposta (valor, regime, prazo, início, pagamento/medição, retenção, antecipação, reajuste, garantia, materiais, faturamento direto, exclusões, hora técnica/extras, validade); conferir a planilha (itens, unidades, quantidades, preços, soma); toda condição da proposta **contrária** a uma cláusula é `conflito`; toda exclusão da proposta que a minuta trata como incluída é `conflito alta`; variantes `reduz_protecao` viram `risco`; não inventar — sem evidência, não há achado; responder em pt-BR; valores no padrão 1.234,56.
- `core.normalizarRevisao(json)`: valida enums, corta textos, descarta achado sem `numero`/`titulo`; teste.
- Persistência: `contrato_revisoes` (status `processando` → `concluida`/`falhou`) + `contrato_achados`, com `conteudo_hash` da versão revisada. Mesmo padrão de "em andamento sobrevive à navegação" da equalização (`mutationKey` + sondagem).
- Cascata de tentativas igual à equalização (sem PDF se a entrada for recusada; concisão se estourar `max_tokens`), com aviso de degradação. **Falha = não pode enviar para validação** (RC-07); botão "Tentar de novo".

## 7. Assinatura das três partes

- `assinaturas` ganha `signatario_id uuid references contrato_signatarios`, `parte` aceita `construtora` e `testemunha`; `unique(contrato_id, parte)` vira `unique(contrato_id, signatario_id)`.
- Link por signatário (token forte, uso único, expira em 7 dias, hash guardado — como hoje). Hoje o link é só para a contratada; passa a valer para **qualquer signatário** (contratante e construtora também podem assinar por link).
- No app: dono/gestor pode **coletar presencialmente** a assinatura de qualquer signatário (assinatura a dedo), registrando `coletado_por`.
- `core.assinatura.ts`: `todasObrigatoriasAssinaram(signatarios, assinaturas)` substitui `ambasPartesAssinaram` para v2 (manter a antiga para legado).
- Posição do carimbo no PDF: cada signatário tem sua caixa no bloco de assinaturas (coordenadas devolvidas pelo `contrato-pdf.ts` ao renderizar — gravar em `parametros._caixas`); continua aplicando rubrica em todas as páginas.
- Integridade (M7) mantida: aplicar só se o PDF atual bater com o `doc_hash` da assinatura anterior; o primeiro `doc_hash` deve ser o `pdf_hash` da emissão.

## 8. Telas (apps/web)

Rotas novas/alteradas (seguir `apps/web/src/screens`, abas atuais, BarraAcao para a ação principal):

| Rota | Tela | Notas |
|---|---|---|
| `/contratos/:id` | `ContratoScreen` | Se `modelo_id` → **assistente v2**; senão tela legada atual |
| `/contratos/:id/etapa/:n` | etapas 1–7 | Seletor de etapas no topo com ✓/⚠ por etapa (pendências do core) |
| `/contratos/:id/revisao` | Revisão IA | lista de achados por severidade; aplicar sugestão / aceitar com justificativa |
| `/contratos/:id/validacao` | Validação | diff hash, variantes que reduzem proteção (checkbox "li e aprovo" item a item), Aprovar / Devolver |
| `/obras/:id` (seção Pessoas) | papéis | seletor de papel no convite; trocar papel; badge Dono/Gestor/Colaborador |
| `/cadastros` (menu do perfil) | Partes e fornecedores | CRUD simples com máscara de CNPJ/CPF |

Componentes: `EtapasContrato`, `CampoQuadro`, `TabelaPlanilha` (mobile: faixa presa como `Matriz.tsx`), `ItemClausula` (selo de origem, "ver padrão", editar → pede justificativa), `CartaoAchado`, `BlocoAssinatura`. Selos de origem: padrão (cinza), parâmetro (índigo), proposta (azul), bloco (verde), variante (âmbar; vermelho se reduz proteção) — sempre com texto, nunca só cor.

Ações por papel: esconder (não só desabilitar) Aprovar/Emitir/Apagar para colaborador; o servidor recusa de qualquer forma.

Download: menu ⋮ → "Baixar .docx" / "Baixar PDF" (antes da emissão: "Baixar minuta .docx/PDF"). iPhone/PWA: mesmo padrão de `navigator.share` dentro do gesto do usuário (ver Decisões de 31/10).

## 9. Hash e integridade

- `conteudo_hash = sha256(canonico(DocumentoResolvido sem `final`))`.
- Calculado no servidor em `/preview`, `/emitir`, `/revisar-contrato`; o cliente pode calcular para exibir, mas o banco só aceita o do servidor (RPCs comparam `p_hash` com `contratos.conteudo_hash`).
- Emissão grava `docx_hash` e `pdf_hash` (sha256 dos bytes).

## 10. Eventos

`contrato_criado_v2`, `dossie_atualizado`, `contrato_salvo` (payload: campos/itens alterados, sem textos longos), `revisao_ia_concluida {achados_alta, media, baixa}`, `revisao_ia_falhou {codigo}`, `achado_resolvido`, `enviado_validacao`, `contrato_devolvido`, `contrato_aprovado {autoaprovacao}`, `contrato_emitido {numero}`, `links_assinatura_gerados {n}`, `assinatura_coletada {parte, via}`, `contrato_assinado`, `contrato_cancelado`.

## 11. Segurança

- Modelo .docx e catálogo: bucket privado + tabela com RLS; nunca no bundle do cliente; **nunca no git enquanto o repo for público**.
- Contratos emitidos: bucket `contratos` privado; caminho derivado no servidor.
- Página pública de assinatura: mostra só número, partes, valor e o PDF do contrato (sem dossiê, sem achados, sem equalização).
- Dados pessoais de signatários (CPF, telefone): mascarados nas listas (`***.982.247-**`).
- Casos de teste e seeds: **só dados fictícios** (`docs/contratos/casos/`).

## 12. Migração e compatibilidade

- Contratos existentes: `modelo_id = null` → modo **legado** (tela, PDF e assinatura atuais), sem migração de conteúdo.
- Novos contratos: sempre v2 quando houver `contrato_modelos` ativo na org; senão legado (feature flag implícita).
- `contrato_clausulas` e `gerarClausulas` permanecem até não haver contratos legados em rascunho (registrar em Decisões quando remover).

## 13. Plano de testes

- **Vitest (core)**: §4.
- **Vitest (server)**: motor docx (§5.1), PDF (texto extraído == texto do docx normalizado), `normalizarRevisao`.
- **pgTAP**: `papeis_obra.test.sql`, `contratos_v2.test.sql` (status, triggers de edição/invalidação, valor = soma, numeração sem buraco com 2 emissões, variante sem justificativa falha), `contrato_fluxo.test.sql` (colaborador não aprova/emite/apaga; aprovar com hash velho falha; enviar sem revisão falha; achado alta pendente bloqueia), `assinaturas_v2.test.sql` (3 partes, n signatários, link por signatário).
- **Playwright**: fluxo feliz com caso fictício — vencedora → assistente → revisão (IA mockada no servidor por env `BID_IA_MOCK=1`) → enviar → aprovar (outro usuário gestor) → emitir → baixar .docx e PDF → assinar 3 partes.
