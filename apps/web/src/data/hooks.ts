import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchAcervo,
  fetchObras,
  fetchObra,
  fetchProposta,
  fetchSugestoes,
  fetchMinhaOrg,
} from './queries';
import { criarObra, criarProposta, criarVersao } from './mutations';

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
