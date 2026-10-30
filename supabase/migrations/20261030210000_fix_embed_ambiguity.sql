-- CORREÇÃO · A FK certames.vencedora_proposta_id → propostas criava uma SEGUNDA
-- relação entre certames e propostas (além de propostas.certame_id → certames).
-- Com duas relações, o PostgREST não sabe qual usar e QUALQUER embed entre as
-- duas tabelas vira ambíguo (erro PGRST201) — isso quebrava o acervo
-- (propostas↔certames), o detalhe da obra, o detalhe da proposta e a
-- equalização. Remover a FK elimina a ambiguidade de todos os embeds de uma vez.
--
-- A integridade da vencedora permanece garantida por:
--   - trigger check_vencedora_org (vencedora precisa ser da mesma org);
--   - a aplicação só define vencedora_proposta_id via RPC (definir_vencedora),
--     sempre para uma proposta existente;
--   - propostas usam exclusão LÓGICA (deleted_at), nunca são removidas de fato,
--     então o antigo ON DELETE SET NULL nunca chegava a atuar.

alter table public.certames drop constraint if exists certames_vencedora_fk;
