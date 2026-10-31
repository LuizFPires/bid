import { gerarClausulas, type PropostaExtraida } from '@bid/core';
import { supabase } from '../lib/supabase';
import { fetchMinhaOrg, fetchProposta } from './queries';
import type { Obra } from './types';

function db() {
  if (!supabase) throw new Error('Supabase não configurado.');
  return supabase;
}

/** Registra uma sugestão de campo livre (ou soma 1 ao uso se já existir). */
export async function registrarSugestao(
  orgId: string,
  tipo: 'categoria' | 'fornecedor' | 'obra' | 'local',
  texto: string,
): Promise<void> {
  const t = texto.trim();
  if (!t) return;
  const { error } = await db().rpc('registrar_sugestao', {
    p_org: orgId,
    p_tipo: tipo,
    p_texto: t,
  });
  if (error) throw error;
}

export interface NovaObraInput {
  nome: string;
  cidade?: string;
}

export async function criarObra(input: NovaObraInput): Promise<Obra> {
  const org = await fetchMinhaOrg();
  if (!org) throw new Error('Organização não encontrada.');

  const { data, error } = await db()
    .from('obras')
    .insert({ org_id: org.id, nome: input.nome.trim(), cidade: input.cidade?.trim() || null })
    .select()
    .single();
  if (error) throw error;

  // Registrar sugestões é best-effort: não deve derrubar a criação da obra.
  try {
    await registrarSugestao(org.id, 'obra', input.nome);
    if (input.cidade) await registrarSugestao(org.id, 'local', input.cidade);
  } catch {
    // ignora — a obra já foi criada; sugestões são secundárias.
  }

  return data as Obra;
}

/* ---------- Nova proposta (upload → extração por IA → conferência → salvar) ---------- */

/** Tira acentos/espaços de um nome de arquivo, preservando a extensão. */
function nomeSeguro(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase();
}

/** A IA lê PDF e imagens (print de conversa, foto de proposta). */
export function arquivoLegivelPelaIA(file: File): boolean {
  const n = file.name.toLowerCase();
  return (
    file.type === 'application/pdf' ||
    file.type.startsWith('image/') ||
    /\.(pdf|png|jpe?g|webp)$/.test(n)
  );
}

export interface ArquivoEnviado {
  path: string;
  /** true quando é PDF (único formato com extração automática neste milestone). */
  ehPdf: boolean;
}

/**
 * Envia o arquivo da proposta ao bucket privado `propostas`, na pasta do
 * usuário (`{org_id}/{user_id}/…`) — convenção exigida pela função de extração.
 */
export async function uploadPropostaArquivo(file: File): Promise<ArquivoEnviado> {
  const org = await fetchMinhaOrg();
  if (!org) throw new Error('Organização não encontrada.');
  const { data: userData, error: userErr } = await db().auth.getUser();
  if (userErr || !userData.user) throw new Error('Sessão inválida.');

  const path = `${org.id}/${userData.user.id}/${Date.now()}-${nomeSeguro(file.name)}`;
  const { error } = await db()
    .storage.from('propostas')
    .upload(path, file, { upsert: false, contentType: file.type || undefined });
  if (error) throw error;

  // "ehPdf" = legível pela IA: PDF ou imagem (print/foto). Planilhas seguem manuais.
  const ehPdf = arquivoLegivelPelaIA(file);
  return { path, ehPdf };
}

/** Chama a função de servidor que lê o PDF e devolve os dados para conferência. */
export async function extrairProposta(path: string): Promise<PropostaExtraida> {
  const { data: sessionData } = await db().auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error('Sessão inválida.');

  const resp = await fetch('/api/ai/extract-proposal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ path }),
  });
  if (!resp.ok) {
    // Lê o corpo cru UMA vez: se for o JSON esperado, usa `erro`; se a função
    // quebrou (resposta não-JSON), mostra o HTTP + um trecho — autoexplicativo.
    const raw = await resp.text().catch(() => '');
    let erro = '';
    try {
      erro = (JSON.parse(raw) as { erro?: string })?.erro ?? '';
    } catch {
      /* corpo não é JSON (provável crash da função) */
    }
    throw new Error(erro || `Extração falhou (HTTP ${resp.status}): ${raw.slice(0, 180) || 'sem corpo'}`);
  }
  const corpo = (await resp.json()) as { dados: PropostaExtraida };
  return corpo.dados;
}

export interface NovaPropostaInput {
  obraId: string;
  categoria: string;
  /** Dados já conferidos/editados pelo usuário. `fornecedor` é obrigatório. */
  dados: PropostaExtraida & { fornecedor: string };
  arquivoPath: string | null;
  /** Rótulo da alternativa de preço, quando o documento trouxe mais de uma. */
  opcao?: string | null;
}

/**
 * Salva a proposta conferida chamando o RPC `criar_proposta`: proposta + 1ª
 * versão + certame (reaproveitado ou criado) de forma ATÔMICA e sem corrida —
 * as invariantes de escrita moram no banco. Nada é gravado sem a conferência do
 * usuário (regra #3). Devolve o id da proposta criada.
 */
export async function criarProposta(input: NovaPropostaInput): Promise<string> {
  const categoria = input.categoria.trim();
  const fornecedor = input.dados.fornecedor.trim();
  if (!categoria) throw new Error('Informe a categoria.');
  if (!fornecedor) throw new Error('Informe o fornecedor.');

  const d = input.dados;
  const { data, error } = await db().rpc('criar_proposta', {
    p_obra: input.obraId,
    p_categoria: categoria,
    p_fornecedor: fornecedor,
    p_valor: d.valor,
    p_prazo: d.prazo_dias,
    p_pagamento: d.condicao_pagamento,
    p_garantia: d.garantia,
    p_obs: d.observacoes,
    p_arquivo_path: input.arquivoPath,
    p_dados: d,
    p_opcao: input.opcao?.trim() || null,
  });
  if (error) throw error;
  const propostaId = data as string;

  // Sugestões são best-effort (não derrubam o salvamento); precisam da org.
  try {
    const org = await fetchMinhaOrg();
    if (org) {
      await registrarSugestao(org.id, 'categoria', categoria);
      await registrarSugestao(org.id, 'fornecedor', fornecedor);
    }
  } catch {
    // ignora — a proposta já foi gravada; sugestões são secundárias.
  }

  return propostaId;
}

export interface NovaEqualizacaoInput {
  escopo: 'obra' | 'entre_obras';
  categoria: string;
  certameId: string | null;
  propostaIds: string[];
  /** Régua do projeto (quantidades/escopo de referência) — opcional. */
  referencia?: string | null;
}

/** Cria uma equalização via RPC atômico. Devolve o id. */
export async function criarEqualizacao(input: NovaEqualizacaoInput): Promise<string> {
  const { data, error } = await db().rpc('criar_equalizacao', {
    p_escopo: input.escopo,
    p_categoria: input.categoria.trim(),
    p_certame: input.certameId,
    p_proposta_ids: input.propostaIds,
    p_referencia: input.referencia?.trim() || null,
  });
  if (error) throw error;
  return data as string;
}

/**
 * Dispara a análise por IA (servidor) de uma equalização já criada. O servidor
 * carrega as propostas (RLS), chama a Claude e grava em `resultado_ia`.
 */
export async function equalizarIA(equalizacaoId: string): Promise<{ avisos: string[] }> {
  const { data: sessionData } = await db().auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error('Sessão inválida.');

  const resp = await fetch('/api/ai/equalize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ id: equalizacaoId }),
  });
  if (!resp.ok) {
    const raw = await resp.text().catch(() => '');
    let erro = '';
    try {
      erro = (JSON.parse(raw) as { erro?: string })?.erro ?? '';
    } catch {
      /* corpo não é JSON (provável crash da função) */
    }
    throw new Error(erro || `Análise falhou (HTTP ${resp.status}): ${raw.slice(0, 180) || 'sem corpo'}`);
  }
  const corpo = (await resp.json().catch(() => ({}))) as { avisos?: string[] };
  return { avisos: corpo.avisos ?? [] };
}

/* ---------- Vencedora (adjudicação) ---------- */

export interface VencedoraEstadoAnterior {
  certame_id: string;
  proposta_status_anterior: string;
  certame_status_anterior: string;
}

/** Marca a proposta como vencedora e adjudica o certame. Devolve o estado
 *  anterior para o "Desfazer". */
export async function definirVencedora(propostaId: string): Promise<VencedoraEstadoAnterior> {
  const { data, error } = await db().rpc('definir_vencedora', { p_proposta: propostaId });
  if (error) throw error;
  return data as VencedoraEstadoAnterior;
}

export interface DesfazerVencedoraInput {
  propostaId: string;
  anterior: VencedoraEstadoAnterior;
}

/** Desfaz a adjudicação, revertendo aos estados anteriores (toast de 5s). */
export async function desfazerVencedora(input: DesfazerVencedoraInput): Promise<void> {
  const { error } = await db().rpc('desfazer_vencedora', {
    p_proposta: input.propostaId,
    p_certame: input.anterior.certame_id,
    p_proposta_status: input.anterior.proposta_status_anterior,
    p_certame_status: input.anterior.certame_status_anterior,
  });
  if (error) throw error;
}

/* ---------- Contrato ---------- */

/**
 * Cria o contrato a partir de uma proposta vencedora: monta as cláusulas no core
 * e grava tudo via RPC atômico `criar_contrato`. Devolve o id do contrato.
 */
export async function criarContrato(propostaId: string): Promise<string> {
  const prop = await fetchProposta(propostaId);
  if (!prop) throw new Error('Proposta não encontrada.');
  const clausulas = gerarClausulas({
    objeto: prop.categoria,
    contratada: prop.fornecedor,
    obra: prop.obraNome,
    valor: prop.valorAtual,
    prazoDias: prop.prazoAtual,
    condicaoPagamento: prop.condicaoPagamento,
    garantia: prop.garantia,
  });
  const { data, error } = await db().rpc('criar_contrato', {
    p_proposta: propostaId,
    p_clausulas: clausulas,
  });
  if (error) throw error;
  return data as string;
}

export async function atualizarClausula(clausulaId: string, texto: string): Promise<void> {
  const { error } = await db().from('contrato_clausulas').update({ texto }).eq('id', clausulaId);
  if (error) throw error;
}

export interface AssinarAppInput {
  contratoId: string;
  parte: 'contratante' | 'contratada';
  signatarioNome: string;
  pngBase64: string;
}

/** Assina o contrato no app (envia a imagem; o servidor aplica ao PDF). */
export async function assinarApp(input: AssinarAppInput): Promise<void> {
  const { data: sessionData } = await db().auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error('Sessão inválida.');
  const resp = await fetch('/api/contracts/sign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });
  if (!resp.ok) {
    const corpo = (await resp.json().catch(() => null)) as { erro?: string } | null;
    throw new Error(corpo?.erro ?? 'Falha ao assinar.');
  }
}

/** Gera o token de assinatura por link de uma parte e devolve o token em claro. */
export async function gerarTokenAssinatura(input: {
  contratoId: string;
  parte: 'contratante' | 'contratada';
  signatario: string;
}): Promise<string> {
  const { data, error } = await db().rpc('gerar_token_assinatura', {
    p_contrato: input.contratoId,
    p_parte: input.parte,
    p_signatario: input.signatario,
  });
  if (error) throw error;
  return data as string;
}

/** Pede ao servidor para renderizar o PDF do contrato e gravá-lo no Storage. */
export async function gerarPdfContrato(contratoId: string): Promise<void> {
  const { data: sessionData } = await db().auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error('Sessão inválida.');
  const resp = await fetch('/api/contracts/pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ id: contratoId }),
  });
  if (!resp.ok) {
    const corpo = (await resp.json().catch(() => null)) as { erro?: string } | null;
    throw new Error(corpo?.erro ?? 'Falha ao gerar o PDF.');
  }
}

/**
 * Gera o relatório de equalização em PDF no servidor e devolve o arquivo.
 * Quem chama decide como entregar (ver `entregarArquivo`): no iPhone instalado
 * como PWA, compartilhar exige um toque do usuário DEPOIS do download — por
 * isso a tela mostra "Relatório pronto · Compartilhar" em vez de disparar direto.
 */
export interface ProgressoPdf {
  fase: 'gerando' | 'baixando';
  /** 0–1 quando o tamanho é conhecido; null = indeterminado. */
  fracao: number | null;
}

export async function gerarRelatorioEqualizacaoPdf(
  equalizacaoId: string,
  onProgresso?: (p: ProgressoPdf) => void,
): Promise<File> {
  const { data: sessionData } = await db().auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error('Sessão inválida.');
  onProgresso?.({ fase: 'gerando', fracao: null });
  const resp = await fetch('/api/equalizacoes/pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ id: equalizacaoId }),
  });
  if (!resp.ok) {
    const corpo = (await resp.json().catch(() => null)) as { erro?: string } | null;
    throw new Error(corpo?.erro ?? `Falha ao gerar o PDF (HTTP ${resp.status}).`);
  }
  const blob = await lerComProgresso(resp, (fracao) => onProgresso?.({ fase: 'baixando', fracao }));
  const nome = nomeDoContentDisposition(resp.headers.get('Content-Disposition')) ?? 'Equalização.pdf';
  return new File([blob], nome, { type: 'application/pdf' });
}

/** Lê o corpo da resposta avisando o avanço (fração quando há Content-Length; senão null). */
async function lerComProgresso(resp: Response, aoAvancar: (fracao: number | null) => void): Promise<Blob> {
  const tipo = resp.headers.get('Content-Type') ?? 'application/pdf';
  const total = Number(resp.headers.get('Content-Length') ?? 0);
  if (!resp.body) return resp.blob();
  const leitor = resp.body.getReader();
  const partes: BlobPart[] = [];
  let lidos = 0;
  aoAvancar(total > 0 ? 0 : null);
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    partes.push(value);
    lidos += value.byteLength;
    aoAvancar(total > 0 ? Math.min(1, lidos / total) : null);
  }
  return new Blob(partes, { type: tipo });
}

/** Nome do arquivo do cabeçalho Content-Disposition: prefere `filename*` (UTF-8, com acentos). */
function nomeDoContentDisposition(cd: string | null): string | null {
  if (!cd) return null;
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(cd)?.[1];
  if (utf8) {
    try {
      return decodeURIComponent(utf8);
    } catch {
      /* cai para o filename simples */
    }
  }
  return /filename="([^"]+)"/.exec(cd)?.[1] ?? null;
}

/** O aparelho sabe compartilhar arquivos (iPhone/Android)? */
export function podeCompartilharArquivo(arquivo: File): boolean {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  return typeof nav.share === 'function' && !!nav.canShare?.({ files: [arquivo] });
}

/**
 * Entrega o arquivo ao usuário. DEVE ser chamada dentro de um toque/clique:
 * folha de compartilhar onde existe (iPhone PWA só aceita assim); senão,
 * download por link.
 */
export async function entregarArquivo(arquivo: File): Promise<void> {
  if (podeCompartilharArquivo(arquivo)) {
    try {
      await navigator.share({ files: [arquivo], title: arquivo.name });
      return;
    } catch (e) {
      if ((e as { name?: string }).name === 'AbortError') return;
      // cai para o download comum
    }
  }
  const url = URL.createObjectURL(arquivo);
  const a = document.createElement('a');
  a.href = url;
  a.download = arquivo.name;
  a.rel = 'noopener';
  a.target = '_blank';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export interface NovaVersaoInput {
  propostaId: string;
  /** Dados já conferidos/editados pelo usuário. */
  dados: PropostaExtraida;
  arquivoPath: string | null;
}

/**
 * Cria uma nova versão da proposta via RPC `criar_versao` (atômico: grava a
 * versão n+1 e atualiza os campos "atuais"; histórico preservado). Devolve o
 * número da nova versão.
 */
export async function criarVersao(input: NovaVersaoInput): Promise<number> {
  const d = input.dados;
  const { data, error } = await db().rpc('criar_versao', {
    p_proposta: input.propostaId,
    p_valor: d.valor,
    p_prazo: d.prazo_dias,
    p_pagamento: d.condicao_pagamento,
    p_garantia: d.garantia,
    p_obs: d.observacoes,
    p_arquivo_path: input.arquivoPath,
    p_dados: d,
  });
  if (error) throw error;
  return data as number;
}

/* ---------- Editar / apagar proposta ---------- */

export interface EditarPropostaInput {
  propostaId: string;
  fornecedor: string;
  valor: number | null;
  prazo: number | null;
  condicaoPagamento: string | null;
  garantia: string | null;
  obs: string | null;
}

/**
 * Corrige os dados da proposta (fornecedor + valor/prazo/pagamento/garantia) via
 * RPC `editar_proposta`. É CORREÇÃO, não revisão: atualiza os campos "atuais" e a
 * versão atual em sincronia, sem gerar nova versão (regra #5 vale p/ revisões).
 */
export async function editarProposta(input: EditarPropostaInput): Promise<void> {
  const fornecedor = input.fornecedor.trim();
  if (!fornecedor) throw new Error('Informe o fornecedor.');
  const { error } = await db().rpc('editar_proposta', {
    p_proposta: input.propostaId,
    p_fornecedor: fornecedor,
    p_valor: input.valor,
    p_prazo: input.prazo,
    p_pagamento: input.condicaoPagamento,
    p_garantia: input.garantia,
    p_obs: input.obs,
  });
  if (error) throw error;

  // Sugestão de fornecedor é best-effort (não derruba a edição).
  try {
    const org = await fetchMinhaOrg();
    if (org) await registrarSugestao(org.id, 'fornecedor', fornecedor);
  } catch {
    // ignora — a edição já foi gravada.
  }
}

/**
 * Muda a categoria da proposta: move para o certame dessa categoria na mesma
 * obra (criado se preciso). RPC `mover_proposta_categoria`. Devolve o certame.
 */
export async function moverPropostaCategoria(input: { propostaId: string; categoria: string }): Promise<string> {
  const categoria = input.categoria.trim();
  if (!categoria) throw new Error('Informe a categoria.');
  const { data, error } = await db().rpc('mover_proposta_categoria', {
    p_proposta: input.propostaId,
    p_categoria: categoria,
  });
  if (error) throw error;
  try {
    const org = await fetchMinhaOrg();
    if (org) await registrarSugestao(org.id, 'categoria', categoria);
  } catch {
    // sugestão é secundária
  }
  return data as string;
}

/** Apaga a proposta (exclusão LÓGICA via RPC `apagar_proposta`, só gestor). */
export async function apagarProposta(propostaId: string): Promise<void> {
  const { error } = await db().rpc('apagar_proposta', { p_proposta: propostaId });
  if (error) throw error;
}

/** Restaura uma proposta apagada (Desfazer do apagar). */
export async function restaurarProposta(propostaId: string): Promise<void> {
  const { error } = await db().rpc('restaurar_proposta', { p_proposta: propostaId });
  if (error) throw error;
}

/* ---------- Categorias: renomear / mesclar ---------- */

/**
 * Move tudo de uma categoria para outra (RPC `mesclar_categoria`): renomeia os
 * certames onde não há destino e migra as propostas onde há. Renomear = mesclar
 * para um nome novo. Devolve quantas tomadas de preços foram alteradas.
 */
export async function mesclarCategoria(input: { de: string; para: string }): Promise<number> {
  const de = input.de.trim();
  const para = input.para.trim();
  if (!de || !para) throw new Error('Informe a categoria.');
  const { data, error } = await db().rpc('mesclar_categoria', { p_de: de, p_para: para });
  if (error) throw error;
  return Number(data ?? 0);
}

/* ---------- Apagar / restaurar equalização e contrato ---------- */

export async function apagarEqualizacao(id: string): Promise<void> {
  const { error } = await db().rpc('apagar_equalizacao', { p_eq: id });
  if (error) throw error;
}
export async function restaurarEqualizacao(id: string): Promise<void> {
  const { error } = await db().rpc('restaurar_equalizacao', { p_eq: id });
  if (error) throw error;
}
export async function apagarContrato(id: string): Promise<void> {
  const { error } = await db().rpc('apagar_contrato', { p_contrato: id });
  if (error) throw error;
}
export async function restaurarContrato(id: string): Promise<void> {
  const { error } = await db().rpc('restaurar_contrato', { p_contrato: id });
  if (error) throw error;
}

/* ---------- Apagar / restaurar obra ---------- */

/** Apaga a obra (exclusão lógica; gestor ou quem criou). */
export async function apagarObra(obraId: string): Promise<void> {
  const { error } = await db().rpc('apagar_obra', { p_obra: obraId });
  if (error) throw error;
}

/** Restaura uma obra apagada (Desfazer). */
export async function restaurarObra(obraId: string): Promise<void> {
  const { error } = await db().rpc('restaurar_obra', { p_obra: obraId });
  if (error) throw error;
}

/* ---------- Acesso por obra: convites ---------- */

/** Dono convida alguém (por e-mail) para a obra; a conta pode ainda não existir. */
export async function convidarParaObra(input: { obraId: string; email: string }): Promise<void> {
  const email = input.email.trim();
  if (!email) throw new Error('Informe o e-mail.');
  const { error } = await db().rpc('convidar_para_obra', { p_obra: input.obraId, p_email: email });
  if (error) throw error;
}

/** Aceita (true) ou recusa (false) um convite meu. */
export async function responderConvite(input: { conviteId: string; aceitar: boolean }): Promise<void> {
  const { error } = await db().rpc('responder_convite', {
    p_convite: input.conviteId,
    p_aceitar: input.aceitar,
  });
  if (error) throw error;
}

/** Dono remove um acesso (convite pendente ou aceito). */
export async function removerAcessoObra(conviteId: string): Promise<void> {
  const { error } = await db().rpc('remover_acesso_obra', { p_convite: conviteId });
  if (error) throw error;
}

/* ---------- Equipe (membros da organização) ---------- */

/** Adiciona uma conta já existente (por e-mail) à org como gestor ou equipe. */
export async function adicionarMembro(input: {
  orgId: string;
  email: string;
  papel: 'gestor' | 'equipe';
}): Promise<void> {
  const email = input.email.trim();
  if (!email) throw new Error('Informe o e-mail.');
  const { error } = await db().rpc('adicionar_membro', {
    p_org: input.orgId,
    p_email: email,
    p_papel: input.papel,
  });
  if (error) throw error;
}

export async function mudarPapelMembro(input: {
  orgId: string;
  userId: string;
  papel: 'gestor' | 'equipe';
}): Promise<void> {
  const { error } = await db().rpc('mudar_papel_membro', {
    p_org: input.orgId,
    p_user: input.userId,
    p_papel: input.papel,
  });
  if (error) throw error;
}

export async function removerMembro(input: { orgId: string; userId: string }): Promise<void> {
  const { error } = await db().rpc('remover_membro', { p_org: input.orgId, p_user: input.userId });
  if (error) throw error;
}
