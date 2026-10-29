-- Seed de homologação (NUNCA em produção). Roda com `supabase db reset`.
-- Cria uma organização de demonstração com obras, certames, propostas, versões
-- e sugestões (baseado no protótipo). Categorias são texto livre.
-- Ao final, vincula o usuário mais recente (se houver) à org demo, para que o
-- acervo apareça ao entrar no app em homologação.

do $$
declare
  v_org uuid := '00000000-0000-4000-8000-000000000001';
  o_aurora uuid; o_clinico uuid; o_arena uuid;
  c1 uuid; c2 uuid; c3 uuid; c4 uuid; c5 uuid; c6 uuid; c7 uuid; c8 uuid;
  p uuid; venc uuid;
begin
  -- Organização demo (idempotente).
  insert into public.organizacoes (id, nome) values (v_org, 'Construtora Demo')
    on conflict (id) do nothing;

  -- Evita duplicar se o seed rodar de novo sobre a mesma org.
  if exists (select 1 from public.obras where org_id = v_org) then
    return;
  end if;

  -- ---------- Obras ----------
  insert into public.obras (org_id, nome, cidade, fase, fase_pill)
    values (v_org, 'Residencial Aurora', 'São Paulo · SP', 'Obra em andamento', 'aberta')
    returning id into o_aurora;
  insert into public.obras (org_id, nome, cidade, fase, fase_pill)
    values (v_org, 'Centro Clínico Pinheiros', 'São Paulo · SP', 'Pré-obra', 'neutro')
    returning id into o_clinico;
  insert into public.obras (org_id, nome, cidade, fase, fase_pill)
    values (v_org, 'Arena Esportiva Campinas', 'Campinas · SP', 'Planejamento', 'neutro')
    returning id into o_arena;

  -- ---------- Certames + propostas (Aurora) ----------
  insert into public.certames (org_id, obra_id, categoria, titulo, status, abertura, limite)
    values (v_org, o_aurora, 'Estrutura pré-moldada', 'Estrutura pré-moldada de concreto', 'analise', '2026-10-02', '2026-11-04')
    returning id into c1;
  insert into public.propostas (org_id, certame_id, fornecedor, status, valor_atual, prazo_atual, condicao_pagamento, garantia, versao_atual)
    values (v_org, c1, 'Premold Paulista', 'analise', 1284500, 95, '30/40/30%', '5 anos', 2) returning id into p;
  insert into public.proposta_versoes (org_id, proposta_id, n, data, valor, prazo, obs) values
    (v_org, p, 1, '2026-10-06', 1342000, 100, 'Proposta inicial com projeto executivo incluso.'),
    (v_org, p, 2, '2026-10-20', 1284500, 95, 'Revisão após visita técnica: desconto de 4,3%.');
  insert into public.propostas (org_id, certame_id, fornecedor, status, valor_atual, prazo_atual, condicao_pagamento, garantia, versao_atual)
    values (v_org, c1, 'Concretex Estruturas', 'analise', 1198900, 110, 'À vista -6%', '3 anos', 3);
  insert into public.propostas (org_id, certame_id, fornecedor, status, valor_atual, prazo_atual, condicao_pagamento, garantia, versao_atual)
    values (v_org, c1, 'Modular Brasil', 'analise', 1242300, 90, '20/50/30%', '7 anos', 2);

  insert into public.certames (org_id, obra_id, categoria, titulo, status, abertura, limite)
    values (v_org, o_aurora, 'Climatização', 'Climatização (HVAC) — VRF', 'aberta', '2026-10-18', '2026-11-08')
    returning id into c2;
  insert into public.propostas (org_id, certame_id, fornecedor, status, valor_atual, prazo_atual, condicao_pagamento, garantia)
    values (v_org, c2, 'ClimaTech Engenharia', 'recebida', 486300, 45, '40/60%', '2 anos');
  insert into public.propostas (org_id, certame_id, fornecedor, status, valor_atual, prazo_atual, condicao_pagamento, garantia)
    values (v_org, c2, 'Ar Pleno Instalações', 'recebida', 512000, 40, 'À vista', '3 anos');

  insert into public.certames (org_id, obra_id, categoria, titulo, status, abertura, limite)
    values (v_org, o_aurora, 'Esquadrias', 'Esquadrias de alumínio e vidros', 'adjudicada', '2026-09-12', '2026-10-03')
    returning id into c3;
  insert into public.propostas (org_id, certame_id, fornecedor, status, valor_atual, prazo_atual, condicao_pagamento, garantia, versao_atual)
    values (v_org, c3, 'Vidro & Forma Esquadrias', 'vencedora', 318700, 38, '30/70%', '5 anos', 2) returning id into venc;
  insert into public.propostas (org_id, certame_id, fornecedor, status, valor_atual, prazo_atual)
    values (v_org, c3, 'AlumiSP Fachadas', 'desclassificada', 355000, 35);
  update public.certames set vencedora_proposta_id = venc where id = c3;

  insert into public.certames (org_id, obra_id, categoria, titulo, status, abertura, limite)
    values (v_org, o_aurora, 'Elétrica', 'Instalações elétricas e SPDA', 'aberta', '2026-10-24', '2026-11-14')
    returning id into c4;
  insert into public.propostas (org_id, certame_id, fornecedor, status, valor_atual, prazo_atual, condicao_pagamento, garantia)
    values (v_org, c4, 'Elétrica Central', 'recebida', 274500, 55, 'Parcelado', '2 anos');

  -- ---------- Certames + propostas (Centro Clínico) ----------
  insert into public.certames (org_id, obra_id, categoria, titulo, status, abertura, limite)
    values (v_org, o_clinico, 'Estrutura pré-moldada', 'Estrutura pré-moldada de concreto', 'aberta', '2026-10-20', '2026-11-17')
    returning id into c5;
  insert into public.propostas (org_id, certame_id, fornecedor, status, valor_atual, prazo_atual, condicao_pagamento, garantia)
    values (v_org, c5, 'Premold Paulista', 'recebida', 1189000, 90, '30/40/30%', '5 anos');
  insert into public.propostas (org_id, certame_id, fornecedor, status, valor_atual, prazo_atual, condicao_pagamento, garantia)
    values (v_org, c5, 'Modular Brasil', 'recebida', 1205000, 88, '20/50/30%', '7 anos');

  insert into public.certames (org_id, obra_id, categoria, titulo, status, abertura, limite)
    values (v_org, o_clinico, 'Hidráulica', 'Instalações hidráulicas', 'analise', '2026-10-10', '2026-10-31')
    returning id into c6;
  insert into public.propostas (org_id, certame_id, fornecedor, status, valor_atual, prazo_atual, condicao_pagamento, garantia, versao_atual)
    values (v_org, c6, 'HidroServ', 'analise', 198400, 42, '40/60%', '3 anos', 2);
  insert into public.propostas (org_id, certame_id, fornecedor, status, valor_atual, prazo_atual, condicao_pagamento, garantia)
    values (v_org, c6, 'Fluxo Engenharia', 'recebida', 215000, 38, 'À vista', '2 anos');

  -- ---------- Certames + propostas (Arena) ----------
  insert into public.certames (org_id, obra_id, categoria, titulo, status, abertura, limite)
    values (v_org, o_arena, 'Estrutura pré-moldada', 'Estrutura pré-moldada de concreto', 'adjudicada', '2026-08-01', '2026-08-29')
    returning id into c7;
  insert into public.propostas (org_id, certame_id, fornecedor, status, valor_atual, prazo_atual, condicao_pagamento, garantia, versao_atual)
    values (v_org, c7, 'Concretex Estruturas', 'vencedora', 1095000, 105, 'À vista -6%', '5 anos', 2) returning id into venc;
  update public.certames set vencedora_proposta_id = venc where id = c7;

  insert into public.certames (org_id, obra_id, categoria, titulo, status, abertura, limite)
    values (v_org, o_arena, 'Pisos', 'Pisos e revestimentos', 'aberta', '2026-10-22', '2026-11-19')
    returning id into c8;
  insert into public.propostas (org_id, certame_id, fornecedor, status, valor_atual, prazo_atual, condicao_pagamento, garantia)
    values (v_org, c8, 'Revest Brasil', 'recebida', 167000, 30, 'Parcelado', '2 anos');

  -- ---------- Sugestões (campo livre) ----------
  insert into public.sugestoes (org_id, tipo, texto, uso) values
    (v_org, 'categoria', 'Estrutura pré-moldada', 3),
    (v_org, 'categoria', 'Climatização', 1),
    (v_org, 'categoria', 'Esquadrias', 1),
    (v_org, 'categoria', 'Elétrica', 1),
    (v_org, 'categoria', 'Hidráulica', 1),
    (v_org, 'categoria', 'Pisos', 1),
    (v_org, 'fornecedor', 'Premold Paulista', 2),
    (v_org, 'fornecedor', 'Concretex Estruturas', 2),
    (v_org, 'fornecedor', 'Modular Brasil', 2),
    (v_org, 'local', 'São Paulo · SP', 2),
    (v_org, 'local', 'Campinas · SP', 1),
    (v_org, 'obra', 'Residencial Aurora', 1),
    (v_org, 'obra', 'Centro Clínico Pinheiros', 1),
    (v_org, 'obra', 'Arena Esportiva Campinas', 1)
  on conflict (org_id, tipo, texto) do nothing;

  -- Vincula o usuário mais recente à org demo (homologação), se existir.
  insert into public.membros (org_id, user_id, papel)
    select v_org, u.id, 'gestor' from auth.users u order by u.created_at desc limit 1
  on conflict (org_id, user_id) do nothing;
end $$;
