import { useMutation, useMutationState, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchAcervo,
  fetchObras,
  fetchObra,
  fetchProposta,
  fetchEqualizacoes,
  fetchEqualizacao,
  fetchPropostasDoCertame,
  fetchPropostasPorCategoria,
  fetchContratos,
  fetchContrato,
  fetchVencedoras,
  fetchAssinaturas,
  fetchSugestoes,
  fetchMinhaOrg,
  fetchMembros,
  fetchMeusConvites,
  fetchAcessoObra,
} from './queries';
import {
  criarObra,
  criarProposta,
  criarVersao,
  criarEqualizacao,
  equalizarIA,
  definirVencedora,
  desfazerVencedora,
  criarContrato,
  atualizarClausula,
  gerarPdfContrato,
  assinarApp,
  editarProposta,
  apagarProposta,
  apagarObra,
  adicionarMembro,
  mudarPapelMembro,
  removerMembro,
  convidarParaObra,
  responderConvite,
  removerAcessoObra,
  apagarEqualizacao,
  apagarContrato,
} from './mutations';

export function useAcervo() {
  return useQuery({ queryKey: ['acervo'], queryFn: fetchAcervo });
}

export function useObras() {
  return useQuery({ queryKey: ['obras'], queryFn: fetchObras });
}

export function useObra(id: string | undefined) {
  return useQuery({
    queryKey: ['obra', id],
    queryFn: () => fetchObra(id as string),
    enabled: Boolean(id),
  });
}

export function useProposta(id: string | undefined) {
  return useQuery({
    queryKey: ['proposta', id],
    queryFn: () => fetchProposta(id as string),
    enabled: Boolean(id),
  });
}

export function useEqualizacoes() {
  return useQuery({ queryKey: ['equalizacoes'], queryFn: fetchEqualizacoes });
}

export function useEqualizacao(id: string | undefined, opts: { sondar?: boolean } = {}) {
  return useQuery({
    queryKey: ['equalizacao', id],
    queryFn: () => fetchEqualizacao(id as string),
    enabled: Boolean(id),
    // Enquanto a IA gera (após recarga, sem a mutação viva), sonda o banco.
    refetchInterval: opts.sondar ? 8000 : false,
  });
}

export function usePropostasDoCertame(certameId: string | undefined) {
  return useQuery({
    queryKey: ['propostas-certame', certameId],
    queryFn: () => fetchPropostasDoCertame(certameId as string),
    enabled: Boolean(certameId),
  });
}

export function usePropostasPorCategoria(categoria: string) {
  const c = categoria.trim();
  return useQuery({
    queryKey: ['propostas-categoria', c],
    queryFn: () => fetchPropostasPorCategoria(c),
    enabled: c.length > 0,
  });
}

export function useContratos() {
  return useQuery({ queryKey: ['contratos'], queryFn: fetchContratos });
}

export function useContrato(id: string | undefined) {
  return useQuery({
    queryKey: ['contrato', id],
    queryFn: () => fetchContrato(id as string),
    enabled: Boolean(id),
  });
}

export function useVencedoras() {
  return useQuery({ queryKey: ['vencedoras'], queryFn: fetchVencedoras });
}

export function useCriarContrato() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: criarContrato,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contratos'] }),
  });
}

export function useAtualizarClausula(contratoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ clausulaId, texto }: { clausulaId: string; texto: string }) =>
      atualizarClausula(clausulaId, texto),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contrato', contratoId] }),
  });
}

export function useGerarPdf(contratoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => gerarPdfContrato(contratoId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contrato', contratoId] }),
  });
}

export function useAssinaturas(contratoId: string | undefined) {
  return useQuery({
    queryKey: ['assinaturas', contratoId],
    queryFn: () => fetchAssinaturas(contratoId as string),
    enabled: Boolean(contratoId),
  });
}

export function useAssinarApp(contratoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: assinarApp,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assinaturas', contratoId] });
      qc.invalidateQueries({ queryKey: ['contrato', contratoId] });
      qc.invalidateQueries({ queryKey: ['contratos'] });
    },
  });
}

export function useSugestoes(tipo: 'categoria' | 'fornecedor' | 'obra' | 'local') {
  return useQuery({ queryKey: ['sugestoes', tipo], queryFn: () => fetchSugestoes(tipo) });
}

export function useMinhaOrg() {
  return useQuery({ queryKey: ['org'], queryFn: fetchMinhaOrg });
}

export function useMembros(orgId: string | undefined) {
  return useQuery({
    queryKey: ['membros', orgId],
    queryFn: () => fetchMembros(orgId as string),
    enabled: Boolean(orgId),
  });
}

export function useAdicionarMembro(orgId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: adicionarMembro,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['membros', orgId] }),
  });
}

export function useMudarPapelMembro(orgId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: mudarPapelMembro,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['membros', orgId] }),
  });
}

export function useRemoverMembro(orgId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: removerMembro,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['membros', orgId] }),
  });
}

/** Convites pendentes para mim — alimenta a notificação no ícone de perfil. */
export function useMeusConvites() {
  return useQuery({
    queryKey: ['convites'],
    queryFn: fetchMeusConvites,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}

export function useAcessoObra(obraId: string | undefined) {
  return useQuery({
    queryKey: ['acesso-obra', obraId],
    queryFn: () => fetchAcessoObra(obraId as string),
    enabled: Boolean(obraId),
  });
}

export function useConvidarParaObra(obraId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: convidarParaObra,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['acesso-obra', obraId] }),
  });
}

export function useResponderConvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: responderConvite,
    // Aceitar libera uma obra inteira: recarrega tudo que depende do acesso.
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['convites'] });
      qc.invalidateQueries({ queryKey: ['obras'] });
      qc.invalidateQueries({ queryKey: ['acervo'] });
      qc.invalidateQueries({ queryKey: ['equalizacoes'] });
      qc.invalidateQueries({ queryKey: ['contratos'] });
    },
  });
}

export function useRemoverAcessoObra(obraId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: removerAcessoObra,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['acesso-obra', obraId] }),
  });
}

export function useCriarObra() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: criarObra,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['obras'] });
      qc.invalidateQueries({ queryKey: ['sugestoes'] });
    },
  });
}

export function useCriarProposta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: criarProposta,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['acervo'] });
      qc.invalidateQueries({ queryKey: ['obras'] });
      qc.invalidateQueries({ queryKey: ['obra'] });
      qc.invalidateQueries({ queryKey: ['sugestoes'] });
    },
  });
}

export function useCriarVersao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: criarVersao,
    onSuccess: (_n, vars) => {
      qc.invalidateQueries({ queryKey: ['proposta', vars.propostaId] });
      qc.invalidateQueries({ queryKey: ['acervo'] });
    },
  });
}

export function useEditarProposta(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: editarProposta,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['proposta', id] });
      qc.invalidateQueries({ queryKey: ['acervo'] });
      qc.invalidateQueries({ queryKey: ['obra'] });
      qc.invalidateQueries({ queryKey: ['equalizacoes'] });
      qc.invalidateQueries({ queryKey: ['equalizacao'] });
      qc.invalidateQueries({ queryKey: ['sugestoes'] });
    },
  });
}

export function useApagarProposta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: apagarProposta,
    // Apagar pode desadjudicar um certame: invalida o mesmo conjunto da vencedora.
    onSuccess: () => invalidarVencedora(qc),
  });
}

export function useApagarEqualizacao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: apagarEqualizacao,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['equalizacoes'] });
      qc.invalidateQueries({ queryKey: ['equalizacao'] });
      qc.invalidateQueries({ queryKey: ['obra'] });
    },
  });
}

export function useApagarContrato() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: apagarContrato,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contratos'] });
      qc.invalidateQueries({ queryKey: ['contrato'] });
      qc.invalidateQueries({ queryKey: ['vencedoras'] });
    },
  });
}

export function useApagarObra() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: apagarObra,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['obras'] });
      qc.invalidateQueries({ queryKey: ['obra'] });
      qc.invalidateQueries({ queryKey: ['acervo'] });
    },
  });
}

export function useCriarEqualizacao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: criarEqualizacao,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['equalizacoes'] });
      qc.invalidateQueries({ queryKey: ['obras'] });
    },
  });
}

/** Invalida tudo que reflete a adjudicação (proposta, acervo, obras, equalizações). */
export function invalidarVencedora(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['proposta'] });
  qc.invalidateQueries({ queryKey: ['acervo'] });
  qc.invalidateQueries({ queryKey: ['obras'] });
  qc.invalidateQueries({ queryKey: ['obra'] });
  qc.invalidateQueries({ queryKey: ['equalizacoes'] });
  qc.invalidateQueries({ queryKey: ['equalizacao'] });
}

export function useDefinirVencedora() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: definirVencedora,
    onSuccess: () => invalidarVencedora(qc),
  });
}

export function useDesfazerVencedora() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: desfazerVencedora,
    onSuccess: () => invalidarVencedora(qc),
  });
}

/* ---------- Análise por IA em andamento (sobrevive à navegação) ---------- */

const CHAVE_IA = 'equalizar-ia';
const LS_PREFIXO = 'bid.eq.gerando.';
const TTL_GERANDO_MS = 6 * 60 * 1000; // função tem 300 s; um pouco além disso = desistiu

/** Marca/desmarca no localStorage (persiste a recarga da página). */
function marcarGerando(id: string, on: boolean) {
  try {
    if (on) localStorage.setItem(LS_PREFIXO + id, String(Date.now()));
    else localStorage.removeItem(LS_PREFIXO + id);
  } catch {
    /* sem storage */
  }
}
function flagGerando(id: string): boolean {
  try {
    const t = Number(localStorage.getItem(LS_PREFIXO + id));
    if (!t) return false;
    if (Date.now() - t > TTL_GERANDO_MS) {
      localStorage.removeItem(LS_PREFIXO + id);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function useEqualizarIA() {
  const qc = useQueryClient();
  return useMutation({
    // Chave fixa: o estado fica no cache de mutações e pode ser lido de qualquer
    // tela (useMutationState) — a espera não some ao navegar.
    mutationKey: [CHAVE_IA],
    mutationFn: equalizarIA,
    onMutate: (equalizacaoId) => marcarGerando(equalizacaoId, true),
    onSettled: (_v, _e, equalizacaoId) => marcarGerando(equalizacaoId, false),
    onSuccess: (_v, equalizacaoId) => {
      qc.invalidateQueries({ queryKey: ['equalizacao', equalizacaoId] });
      qc.invalidateQueries({ queryKey: ['equalizacoes'] });
    },
  });
}

/** Ids de equalizações com análise em andamento (mutação pendente OU flag recente). */
export function useAnalisesEmAndamento(ids: readonly string[] = []): Set<string> {
  const pendentes = useMutationState({
    filters: { mutationKey: [CHAVE_IA], status: 'pending' },
    select: (m) => m.state.variables as string,
  });
  const set = new Set(pendentes);
  for (const id of ids) if (flagGerando(id)) set.add(id);
  return set;
}

/**
 * Estado da análise de UMA equalização, visível de qualquer tela:
 * em andamento (mutação pendente ou flag recente após recarga) e o erro da
 * última tentativa (fica no cache de mutações até ser descartado).
 */
export function useAnaliseEmAndamento(id: string | undefined, temResultado: boolean) {
  const pendentes = useMutationState({
    filters: { mutationKey: [CHAVE_IA], status: 'pending' },
    select: (m) => m.state.variables as string,
  });
  const erros = useMutationState({
    filters: { mutationKey: [CHAVE_IA], status: 'error' },
    select: (m) => ({ id: m.state.variables as string, erro: m.state.error as Error | null, em: m.state.submittedAt }),
  });
  const pendente = !!id && pendentes.includes(id);
  // Após recarregar a página a mutação não existe mais; a flag cobre esse caso
  // até o resultado chegar (ou o TTL vencer).
  const porFlag = !!id && !pendente && !temResultado && flagGerando(id);
  const ultimoErro = erros.filter((e) => e.id === id).sort((a, b) => b.em - a.em)[0]?.erro ?? null;
  return { emAndamento: pendente || porFlag, porFlag, ultimoErro };
}
