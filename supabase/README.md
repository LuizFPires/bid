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

## Modelo da minuta de contrato (M9)

O texto da minuta padrão **não fica no git** (repositório público). Ele mora em `docs/contratos/_privado/` (pasta ignorada) e sobe para o Supabase por um script local, com a chave `service_role` só no ambiente:

```bash
SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=<chave> \
node scripts/seed-modelo-contrato.mjs --org <uuid-da-organizacao>
```

O script sobe o `.docx` ao bucket privado `modelos` ({org}/empreitada-1.0.docx), grava `contrato_modelos` (catálogo de cláusulas) e a biblioteca (`modelo_blocos`, `modelo_variantes`, `modelo_parametros`). É idempotente: repetir atualiza. Opções: `--versao 1.1`, `--inativo`, `--logo-ampla caminho.png`. O cliente nunca baixa o modelo cru: só o servidor lê o bucket.
