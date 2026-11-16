import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listGuests,
  searchGuests,
  getGuest,
  createGuest,
  updateGuest,
  deleteGuest,
  type GuestInput,
} from './guestsApi.js';
import { ApiError } from '../../lib/http.js';

export const guestKeys = {
  all: ['guests'] as const,
  detail: (id: string) => ['guests', id] as const,
  // Chave própria: a busca nunca reaproveita (nem preenche) o cache da lista inteira.
  search: (term: string) => ['guests', 'search', term] as const,
};

/** Tela de hóspedes: lista inteira (contrato antigo de GET /guests; paginação na T-05.12). */
export function useGuests() {
  return useQuery({ queryKey: guestKeys.all, queryFn: listGuests });
}

/** Mínimo de caracteres para buscar: com menos, quase todo nome casa e a busca não filtra. */
export const MIN_SEARCH_TERM = 3;
export const SEARCH_LIMIT = 6;

/** Termo que vai ao servidor, ou null quando ainda é curto demais para consultar. */
export function searchTermOf(raw: string): string | null {
  const term = raw.trim();
  return term.length >= MIN_SEARCH_TERM ? term : null;
}

/**
 * Opções da busca de hóspede (`GET /guests?q=&limit=`). Separadas do hook para o teste prender
 * a regra: sem termo válido, `enabled` é false e nada é consultado.
 */
export function guestSearchOptions(raw: string) {
  const term = searchTermOf(raw);
  return {
    queryKey: guestKeys.search(term ?? ''),
    queryFn: () => searchGuests(term ?? '', SEARCH_LIMIT),
    enabled: term !== null,
  };
}

/** Busca da nova reserva: só o servidor filtra; o navegador recebe no máximo SEARCH_LIMIT. */
export function useGuestSearch(raw: string) {
  return useQuery(guestSearchOptions(raw));
}

/**
 * 4xx é resposta definitiva (o hóspede não existe, é de outro hotel ou o id é inválido): repetir
 * só segurava a ficha em "Carregando…". Falha de servidor ou de rede repete uma vez, como o
 * padrão do app (lib/queryClient.ts).
 */
export function retryGuestDetail(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
  return failureCount < 1;
}

/** Opções da ficha, separadas do hook para o teste prender que a regra de retry está ligada. */
export function guestDetailOptions(id: string | undefined) {
  return {
    queryKey: guestKeys.detail(id ?? ''),
    queryFn: () => getGuest(id as string),
    enabled: !!id,
    retry: retryGuestDetail,
  };
}

export function useGuest(id: string | undefined) {
  return useQuery(guestDetailOptions(id));
}

export function useCreateGuest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: GuestInput) => createGuest(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: guestKeys.all }),
  });
}

export function useUpdateGuest(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: GuestInput) => updateGuest(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: guestKeys.all });
      qc.invalidateQueries({ queryKey: guestKeys.detail(id) });
    },
  });
}

export function useDeleteGuest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteGuest(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: guestKeys.all }),
  });
}
