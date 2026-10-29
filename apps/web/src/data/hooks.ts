import { useQuery } from '@tanstack/react-query';
import { fetchAcervo, fetchObras, fetchObra, fetchSugestoes } from './queries';

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

export function useSugestoes(tipo: 'categoria' | 'fornecedor' | 'obra' | 'local') {
  return useQuery({ queryKey: ['sugestoes', tipo], queryFn: () => fetchSugestoes(tipo) });
}
