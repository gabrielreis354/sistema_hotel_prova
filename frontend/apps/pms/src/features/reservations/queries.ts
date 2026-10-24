import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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

export function useReservationList(params: ReservationListParams, enabled = true) {
  return useQuery({
    queryKey: reservationKeys.list(params),
    queryFn: () => listReservations(params),
    // Período inválido (de > até) não vai ao servidor.
    enabled,
    // Ao trocar de página a tabela anterior fica na tela até a próxima chegar — sem piscar vazio.
    placeholderData: keepPreviousData,
  });
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

export function useCreateReservation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateReservationInput) => createReservation(input),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: reservationKeys.all });
      // Criou ou perdeu a corrida: nos dois casos a disponibilidade mudou.
      qc.invalidateQueries({ queryKey: ['rooms'] });
    },
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
