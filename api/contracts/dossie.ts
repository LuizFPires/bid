import type { VercelRequest, VercelResponse } from '@vercel/node';
import { montarDossie, parametrosIniciais, qualificar, normalizarAnalise, type Dossie, type PartesContrato, type ParteSnapshot } from '@bid/core';
import { MissingEnvError, bearer, requireMethod, serviceClient, userClient } from '@bid/server';

/**
 * POST /api/contracts/dossie  { contratoId, refazer?: boolean }
 * Monta o DOSSIÊ da vencedora (proposta + leitura da IA + o que a equalização
 * disse dela + obra), fotografa em `contratos.dossie` (service_role, RPC
 * atualizar_dossie) e, na primeira vez, semeia o contrato: parâmetros do
 * quadro, partes qualificadas, itens padrão do catálogo, planilha a partir dos
 * itens lidos e signatários dos cadastros (RPC salvar_contrato, como o usuário).
 * Em `refazer`, só o dossiê e os campos do quadro ainda vazios são atualizados.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    await processar(req, res);
  } catch (e) {
    console.error('contracts/dossie crash:', e);
    if (!res.headersSent) res.status(502).json({ erro: 'Não foi possível montar o dossiê.' });
  }
}

type Sig = { nome: string; cpf: string | null; cargo: string | null; email: string | null; telefone: string | null; ordem: number; ativo: boolean };
type ParteRow = { id: string; tipo: string; razao_social: string; nome_curto: string | null; natureza: string | null; cnpj: string; endereco: string; cep: string | null; email: string | null; marca: 'ampla' | 'classica' | null; parte_signatarios: Sig[] | null };

function snapshot(p: Omit<ParteRow, 'tipo' | 'marca' | 'parte_signatarios'> & { sigs: Sig[] }): ParteSnapshot {
  const ativos = p.sigs.filter((s) => s.ativo).sort((a, b) => a.ordem - b.ordem);
  return {
    origemId: p.id,
    razao_social: p.razao_social,
    nome_curto: p.nome_curto,
    natureza: p.natureza,
    cnpj: p.cnpj,
    endereco: p.endereco,
    cep: p.cep,
    email: p.email,
    qualificacao: qualificar(p, ativos),
  };
}

async function processar(req: VercelRequest, res: VercelResponse) {
  if (!requireMethod(req, res, 'POST')) return;
  const token = bearer(req);
  if (!token) return void res.status(401).json({ erro: 'Não autenticado.' });
  // `refazer` do cliente é só semântico: a semeadura é decidida pela ausência de itens.
  const body = (req.body ?? {}) as { contratoId?: unknown; refazer?: unknown };
  const contratoId = typeof body.contratoId === 'string' ? body.contratoId : '';
  if (!contratoId) return void res.status(400).json({ erro: 'Informe o contrato.' });

  const sb = userClient(token);
  const { data: k } = await sb
    .from('contratos')
    .select('id, org_id, obra_id, proposta_id, certame_id, categoria, status, modelo_id, dossie, parametros, partes, obras ( id, nome, cidade, endereco, cep, cno, foro, contratante_id, construtora_id ), contrato_modelos ( catalogo )')
    .eq('id', contratoId)
    .is('deleted_at', null)
    .maybeSingle();
  const c = k as unknown as {
    id: string; org_id: string; obra_id: string; proposta_id: string; certame_id: string; categoria: string; status: string; modelo_id: string | null;
    dossie: Dossie | null; parametros: Record<string, string>; partes: Partial<PartesContrato>;
    obras: { id: string; nome: string; cidade: string | null; endereco: string | null; cep: string | null; cno: string | null; foro: string | null; contratante_id: string | null; construtora_id: string | null } | null;
    contrato_modelos: { catalogo: unknown } | null;
  } | null;
  if (!c) return void res.status(404).json({ erro: 'Contrato não encontrado.' });
  if (!c.modelo_id) return void res.status(409).json({ erro: 'Contrato legado não usa dossiê.' });
  if (!['rascunho', 'devolvido'].includes(c.status)) return void res.status(409).json({ erro: 'O dossiê só muda em rascunho/devolvido.' });
  const obra = Array.isArray(c.obras) ? c.obras[0] : c.obras;
  if (!obra) return void res.status(404).json({ erro: 'Obra do contrato não encontrada.' });

  // Proposta + última versão (leitura da IA) + equalização do certame
  const [{ data: prop }, { data: versoes }, { data: eqs }] = await Promise.all([
    sb.from('propostas').select('id, fornecedor, opcao, valor_atual, prazo_atual, condicao_pagamento, garantia, versao_atual').eq('id', c.proposta_id).maybeSingle(),
    sb.from('proposta_versoes').select('n, arquivo_path, dados_extraidos').eq('proposta_id', c.proposta_id).order('n', { ascending: false }).limit(1),
    sb.from('equalizacoes').select('id, resultado_ia, proposta_ids').eq('certame_id', c.certame_id).is('deleted_at', null).not('resultado_ia', 'is', null).order('created_at', { ascending: false }).limit(1),
  ]);
  const p = prop as { id: string; fornecedor: string; opcao: string | null; valor_atual: number | null; prazo_atual: number | null; condicao_pagamento: string | null; garantia: string | null; versao_atual: number | null } | null;
  if (!p) return void res.status(404).json({ erro: 'Proposta do contrato não encontrada.' });
  const v = (versoes as { n: number; arquivo_path: string | null; dados_extraidos: unknown }[] | null)?.[0] ?? null;
  const eq = (eqs as { id: string; resultado_ia: unknown; proposta_ids: string[] }[] | null)?.[0] ?? null;
  const analise = eq ? { id: eq.id, ...normalizarAnalise(eq.resultado_ia, eq.proposta_ids) } : null;

  const dossie = montarDossie({
    proposta: { id: p.id, fornecedor: p.fornecedor, opcao: p.opcao, versao: v?.n ?? p.versao_atual, arquivoPath: v?.arquivo_path ?? null, valor: p.valor_atual, prazoDias: p.prazo_atual, condicaoPagamento: p.condicao_pagamento, garantia: p.garantia },
    extraida: (v?.dados_extraidos as Parameters<typeof montarDossie>[0]['extraida']) ?? null,
    analise,
    obra: { id: obra.id, nome: obra.nome, cidade: obra.cidade, endereco: obra.endereco, cep: obra.cep, cno: obra.cno, foro: obra.foro },
    categoria: c.categoria,
  });

  // Fotografia: só o servidor grava (service_role).
  let svc;
  try {
    svc = serviceClient();
  } catch (e) {
    if (e instanceof MissingEnvError) return void res.status(503).json({ erro: 'Dossiê não configurado no servidor.' });
    throw e;
  }
  const { error: dErr } = await svc.rpc('atualizar_dossie', { p_contrato: c.id, p_dossie: dossie });
  if (dErr) return void res.status(502).json({ erro: 'Não foi possível gravar o dossiê.' });

  // Partes: contratante e construtora da obra; contratada do cadastro de fornecedores (por razão social).
  const [{ data: partesRows }, { data: fornRows }] = await Promise.all([
    sb.from('partes').select('id, tipo, razao_social, nome_curto, natureza, cnpj, endereco, cep, email, marca, parte_signatarios ( nome, cpf, cargo, email, telefone, ordem, ativo )').eq('org_id', c.org_id).is('deleted_at', null),
    sb.from('fornecedores').select('id, razao_social, nome_curto, natureza, cnpj, endereco, cep, email, responsavel_tecnico, crea, fornecedor_signatarios ( nome, cpf, cargo, email, telefone, ordem, ativo )').eq('org_id', c.org_id).is('deleted_at', null),
  ]);
  const partes = (partesRows ?? []) as unknown as ParteRow[];
  const forns = (fornRows ?? []) as unknown as (Omit<ParteRow, 'tipo' | 'marca' | 'parte_signatarios'> & { responsavel_tecnico: string | null; crea: string | null; fornecedor_signatarios: Sig[] | null })[];
  const ct = partes.find((x) => x.id === obra.contratante_id) ?? null;
  const cs = partes.find((x) => x.id === obra.construtora_id) ?? null;
  const chave = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const cd = forns.find((f) => chave(f.razao_social) === chave(p.fornecedor) || (f.nome_curto && chave(f.nome_curto) === chave(p.fornecedor))) ?? null;

  const partesSnap: PartesContrato = {
    contratante: ct ? snapshot({ ...ct, sigs: ct.parte_signatarios ?? [] }) : (c.partes.contratante ?? null),
    contratada: cd ? snapshot({ ...cd, sigs: cd.fornecedor_signatarios ?? [] }) : (c.partes.contratada ?? null),
    construtora: cs ? { ...snapshot({ ...cs, sigs: cs.parte_signatarios ?? [] }), marca: cs.marca } : (c.partes.construtora ?? null),
  };
  const declarante = (cd?.fornecedor_signatarios ?? []).filter((s) => s.ativo).sort((a, b) => a.ordem - b.ordem)[0] ?? null;
  const sugeridos = parametrosIniciais(dossie, partesSnap, {
    representante: cd?.responsavel_tecnico ?? null,
    declarante: declarante ? { nome: declarante.nome, cpf: declarante.cpf, cargo: declarante.cargo } : null,
  });

  // Semeia quando o contrato ainda não tem itens de cláusula (dossiê gravado e
  // semeadura falha no meio não deixam o contrato "vazio para sempre").
  const { count: nItens } = await sb.from('contrato_itens_clausula').select('id', { count: 'exact', head: true }).eq('contrato_id', c.id);
  const primeiraVez = (nItens ?? 0) === 0;
  const patch: Record<string, unknown> = {};
  if (primeiraVez) {
    patch.parametros = sugeridos;
    patch.partes = partesSnap;
    // Itens padrão do catálogo (origem 'padrao'); Anexo II como 'decl:N'.
    const cat = (c.contrato_modelos && !Array.isArray(c.contrato_modelos) ? c.contrato_modelos.catalogo : null) as
      | { clausulas?: { itens?: { numero: string; texto: string }[] }[]; anexo_ii?: { numero: string; titulo: string; texto: string }[] }
      | null;
    const itens: unknown[] = [];
    for (const cl of cat?.clausulas ?? []) for (const it of cl.itens ?? []) itens.push({ numero: it.numero, texto: it.texto, textoPadrao: it.texto, origem: 'padrao' });
    for (const d of cat?.anexo_ii ?? []) itens.push({ numero: `decl:${d.numero}`, texto: d.texto, textoPadrao: d.texto, origem: 'padrao' });
    if (itens.length) patch.itens = itens;
    // Planilha a partir dos itens lidos da proposta
    const linhas = dossie.proposta.itens.map((it, i) => ({ codigo: String(i + 1), grupo: false, descricao: it.descricao, unidade: null, quantidade: it.qtd, preco_unitario: it.unit ?? (it.total != null && it.qtd ? it.total / it.qtd : null) }));
    if (linhas.length) patch.planilha = linhas;
    // Signatários iniciais: um por parte, dos cadastros
    const sigs: unknown[] = [];
    const puxar = (parte: string, lista: Sig[] | null | undefined) => {
      for (const s of (lista ?? []).filter((x) => x.ativo).sort((a, b) => a.ordem - b.ordem)) sigs.push({ parte, nome: s.nome, cpf: s.cpf, cargo: s.cargo, email: s.email, telefone: s.telefone, obrigatorio: true });
    };
    puxar('contratante', ct?.parte_signatarios);
    puxar('contratada', cd?.fornecedor_signatarios);
    puxar('construtora', cs?.parte_signatarios);
    if (sigs.length) patch.signatarios = sigs;
  } else {
    // Refazer: completa só o que está vazio (não sobrescreve o que o usuário editou).
    const faltando: Record<string, string> = {};
    for (const [k2, v2] of Object.entries(sugeridos)) if (!(c.parametros?.[k2] ?? '').trim()) faltando[k2] = v2;
    if (Object.keys(faltando).length) patch.parametros = faltando;
    if (!c.partes.contratante && partesSnap.contratante) patch.partes = partesSnap;
  }
  if (Object.keys(patch).length) {
    const { error: sErr } = await sb.rpc('salvar_contrato', { p_contrato: c.id, p_patch: patch });
    if (sErr) {
      console.error('contracts/dossie: salvar_contrato falhou', sErr);
      return void res.status(502).json({ erro: 'Dossiê gravado, mas não foi possível preencher o contrato. Tente de novo.' });
    }
  }

  res.status(200).json({ dossie, semeado: primeiraVez, partes: partesSnap, faltam: { contratante: !partesSnap.contratante, contratada: !partesSnap.contratada, construtora: !partesSnap.construtora } });
}
