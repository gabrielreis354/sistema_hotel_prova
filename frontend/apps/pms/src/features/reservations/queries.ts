import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { ApiError } from '../../lib/http.js';
import { guestKeys } from '../guests/index.js';
import {
  createPayment,
  createReservation,
  getBill,
  getReservation,
  listAvailableRooms,
  listReservations,
  transitionReservation,
  type CreateReservationInput,
  type PaymentInput,
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

/**
 * A conta de quem vai confirmar um check-out: sempre busca de novo, mesmo com cache recente — um
 * consumo lançado em outro aparelho não invalida este. Quem usa só libera a ação com
 * `isSuccess && !isFetching`.
 */
export function freshBillOptions(id: string | undefined) {
  return {
    queryKey: reservationKeys.bill(id ?? ''),
    queryFn: () => getBill(id ?? ''),
    enabled: !!id,
    staleTime: 0,
    refetchOnMount: 'always' as const,
  };
}

export function useFreshBill(id: string | undefined) {
  return useQuery(freshBillOptions(id));
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

/**
 * Registra o pagamento do check-out (M5-b). onSettled, não onSuccess: sem resposta o pagamento
 * pode ter gravado, e a conta recarregada é o que a recepção confere antes de repetir (D7).
 * Recarrega a reserva inteira (bill e detalhe) e as contas, que mudam de CLOSED para PAID.
 */
export function createPaymentOptions(qc: Pick<QueryClient, 'invalidateQueries'>) {
  return {
    mutationFn: (body: PaymentInput) => createPayment(body),
    // 'always': sem rede o React Query PAUSAVA a gravação — botão em "Registrando…" sem aviso, e o
    // pagamento saía sozinho quando a rede voltava, ou sumia se a página recarregasse. Agora o
    // createPayment decide na hora: sem rede, "não foi registrado" (achado do qa-explorador, 09/11).
    networkMode: 'always' as const,
    onSettled: () => {
      qc.invalidateQueries({ queryKey: reservationKeys.all });
      qc.invalidateQueries({ queryKey: ['accounts'] });
    },
  };
}

export function useCreatePayment() {
  return useMutation(createPaymentOptions(useQueryClient()));
}
