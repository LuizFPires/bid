# supabase · bid

Infra de dados: Postgres + Auth (link mágico) + Storage (buckets privados) + RLS.

## Estrutura

```
config.toml    configuração do CLI (auth por link mágico, storage)
migrations/    SQL versionado (toda migration com política RLS + teste no mesmo PR)
tests/         testes de política (pgTAP) — `supabase test db`
seed.sql       seed de homologação (fora de produção)
```

## Regras (CLAUDE.md)

- **RLS em tudo.** Toda tabela nasce com política e teste de política no mesmo PR.
- **Buckets privados** (`propostas`, `contratos`, `assinaturas`): download só por URL assinada.
- **Nada se apaga de fato:** exclusão lógica (`deleted_at`) + tabela `eventos` (modelo no M1).

## Ação externa (usuário)

1. Criar o projeto no Supabase e pegar `SUPABASE_URL`, `anon key` e `service_role key`.
2. `supabase link --project-ref <ref>` e `supabase db push` para aplicar as migrations.
3. Configurar o provedor de e-mail do Auth (link mágico) e as URLs de redirect.
