import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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

export function useEqualizacao(id: string | undefined) {
  return useQuery({
    queryKey: ['equalizacao', id],
    queryFn: () => fetchEqualizacao(id as string),
    enabled: Boolean(id),
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

export function useEqualizarIA() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: equalizarIA,
    onSuccess: (_v, equalizacaoId) => {
      qc.invalidateQueries({ queryKey: ['equalizacao', equalizacaoId] });
      qc.invalidateQueries({ queryKey: ['equalizacoes'] });
    },
  });
}
