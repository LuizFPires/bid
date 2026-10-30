# bid

App (PWA, mobile first) para gerir **propostas de obra**: acervo por categoria, controle de versões, **equalização** com apoio de IA, definição da **vencedora** e geração de **contrato** com **assinatura digital**.

Produto independente. Documentação em [`docs/`](docs/): [PRD](docs/PRD.md) · [SPEC](docs/SPEC.md) · [PLAN](docs/PLAN.md) · [protótipo](docs/prototipo-bid.html). Guia do agente: [CLAUDE.md](CLAUDE.md).

## Identidade visual v1.0

[Manual da marca e kit](docs/brand/README.md) · [Manual PDF](output/pdf/bid-manual-da-marca-v1.pdf) · [Catálogo visual](docs/brand/index.html) · [Design system](docs/brand/DESIGN-SYSTEM.md).

A nova identidade aprovada usa duas folhas sobrepostas, lettering próprio e Sora na interface. O kit está documentado; a migração do aplicativo, que ainda utiliza a identidade anterior, permanece separada.

## Monorepo

```
apps/web        PWA (React + Vite + TypeScript)
apps/api        funções de servidor (Vercel Functions): extract, equalize, pdf, sign
packages/core   regras de domínio puras e testadas (Vitest)
packages/ui     design system bid (tokens índigo, componentes, logomarca 3D)
supabase        migrations, policies (RLS), seed, functions
docs            PRD, SPEC, PLAN, protótipo
```

## Pré-requisitos

- Node >= 22 (o pnpm 11 exige Node 22.13+)
- pnpm (`corepack enable` ou `npm i -g pnpm`)

## Começar

```bash
pnpm install
cp .env.example .env   # preencha os valores (veja abaixo)
pnpm dev               # inicia o PWA (apps/web)
```

## Scripts (raiz)

| Script             | O que faz                                  |
| ------------------ | ------------------------------------------ |
| `pnpm dev`         | roda o PWA em desenvolvimento              |
| `pnpm build`       | build de todos os pacotes e do web         |
| `pnpm typecheck`   | checagem de tipos em todos os pacotes      |
| `pnpm test`        | testes (Vitest) em todos os pacotes        |
| `pnpm lint`        | ESLint                                     |
| `pnpm format`      | Prettier (escreve)                         |

## Variáveis de ambiente

Veja [`.env.example`](.env.example). A chave da Anthropic e a `service_role` do Supabase **só existem no servidor**; o cliente usa apenas `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.

## Infra (ações externas, feitas pelo usuário)

O código roda offline para desenvolvimento, mas o produto completo depende de contas externas:

- **Supabase:** projeto (Postgres + Auth magic link + Storage), buckets privados `propostas`, `contratos`, `assinaturas`.
- **Vercel:** deploy do PWA e das funções de API; variáveis de ambiente.
- **Anthropic:** `ANTHROPIC_API_KEY` (extração e equalização).
- **GitHub:** repositório remoto para CI e deploy contínuo.
