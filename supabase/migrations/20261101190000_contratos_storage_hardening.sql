-- Revisão independente final (M14): o bucket `contratos` só recebe escrita do
-- servidor. As policies de insert/update de cliente (M5) deixavam qualquer
-- colaborador da org sobrescrever `emitido-*.pdf`/`assinado-*.pdf` (a leitura
-- confere `pdf_path` do banco, não os bytes). Nenhum código cliente grava
-- nesse bucket: PDF legado, emissão e assinatura passam pela service_role.
drop policy if exists "bid_contratos_insert" on storage.objects;
drop policy if exists "bid_contratos_update" on storage.objects;

-- Hash do token de link não precisa ser legível pelo cliente (só o servidor
-- compara). Mantém a leitura das demais colunas para a tela de assinaturas.
revoke select (token_hash) on public.assinaturas from authenticated;
