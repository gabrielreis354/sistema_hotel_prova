import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { ApiError } from '../../lib/http.js';
import { guestKeys } from '../guests/index.js';
import {
  createReservation,
  getBill,
  getReservation,
  listAvailableRooms,
  listReservations,
  transitionReservation,
  type CreateReservationInput,
  type ReservationListParams,
  type ReservationTransition,
} from './reservationsApi.js';

export const reservationKeys = {
  all: ['reservations'] as const,
  list: (p: ReservationListParams) => ['reservations', 'list', p] as const,
  detail: (id: string) => ['reservations', 'detail', id] as const,
  bill: (id: string) => ['reservations', 'bill', id] as const,
  available: (checkIn: string, checkOut: string) => ['rooms', 'available', checkIn, checkOut] as const,
};

/**
 * Opções da lista. A regra "período inválido (de > até) não vai ao servidor" mora aqui, e não
 * no chamador, para não poder ser esquecida — e o teste a prende (reservationQueries.test.ts).
 */
export function reservationListOptions(params: ReservationListParams) {
  return {
    queryKey: reservationKeys.list(params),
    queryFn: () => listReservations(params),
    enabled: params.from <= params.to,
    // Ao trocar de página a tabela anterior fica na tela até a próxima chegar — sem piscar vazio.
    placeholderData: keepPreviousData,
  };
}

export function useReservationList(params: ReservationListParams) {
  return useQuery(reservationListOptions(params));
}

export function useReservation(id: string | undefined) {
  return useQuery({
    queryKey: reservationKeys.detail(id ?? ''),
    queryFn: () => getReservation(id ?? ''),
    enabled: !!id,
  });
}

export function useBill(id: string | undefined) {
  return useQuery({
    queryKey: reservationKeys.bill(id ?? ''),
    queryFn: () => getBill(id ?? ''),
    enabled: !!id,
  });
}

export function useAvailableRooms(checkIn: string, checkOut: string, enabled: boolean) {
  return useQuery({
    queryKey: reservationKeys.available(checkIn, checkOut),
    queryFn: () => listAvailableRooms(checkIn, checkOut),
    enabled,
  });
}

/**
 * O que a criação deixa desatualizado. Criou ou perdeu a corrida: a disponibilidade mudou nos
 * dois casos. No 404 o hóspede escolhido pode ter sido excluído — a busca não pode continuar
 * oferecendo quem não existe mais (os quartos já entram pela invalidação de `rooms`).
 */
export function invalidateAfterCreate(qc: Pick<QueryClient, 'invalidateQueries'>, error: unknown) {
  qc.invalidateQueries({ queryKey: reservationKeys.all });
  qc.invalidateQueries({ queryKey: ['rooms'] });
  if (error instanceof ApiError && error.status === 404) qc.invalidateQueries({ queryKey: guestKeys.all });
}

export function useCreateReservation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateReservationInput) => createReservation(input),
    onSettled: (_data, error) => invalidateAfterCreate(qc, error),
  });
}

export function useTransitionReservation(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (action: ReservationTransition) => transitionReservation(id, action),
    // onSettled, não onSuccess: no 422 o estado mudou em outro atendimento, e a tela precisa
    // recarregar a reserva para mostrar o que vale agora.
    onSettled: () => {
      qc.invalidateQueries({ queryKey: reservationKeys.all });
      qc.invalidateQueries({ queryKey: ['rooms'] });
    },
  });
}
