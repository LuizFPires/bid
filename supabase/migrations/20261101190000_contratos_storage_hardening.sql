-- Revisão independente final (M14): o bucket `contratos` só recebe escrita do
-- servidor. As policies de insert/update de cliente (M5) deixavam qualquer
-- colaborador da org sobrescrever `emitido-*.pdf`/`assinado-*.pdf` (a leitura
-- confere `pdf_path` do banco, não os bytes). Nenhum código cliente grava
-- nesse bucket: PDF legado, emissão e assinatura passam pela service_role.
drop policy if exists "bid_contratos_insert" on storage.objects;
drop policy if exists "bid_contratos_update" on storage.objects;

-- Hash do token de link (e IP/user agent da trilha) não precisam ser legíveis
-- pelo cliente: só o servidor compara/escreve. Privilégio por coluna só vale
-- sem SELECT de tabela, então revoga a tabela e concede as colunas que as
-- telas usam (RLS continua valendo por cima).
revoke select on public.assinaturas from authenticated;
grant select (id, org_id, contrato_id, signatario_id, parte, signatario_nome, via, coletado_por, token_expira, assinado_em, doc_hash, created_at)
  on public.assinaturas to authenticated;
