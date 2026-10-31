import type { components } from '@hotel/api-client';
import { api } from '../../lib/api.js';
import { ApiError } from '../../lib/http.js';

// Tipos do Swagger regenerado. Cada endpoint tem o seu: a lista devolve ReservationListItem
// (resumo de hóspede e quarto), o detalhe devolve ReservationDetail (hóspede e quartos inteiros)
// e as transições devolvem a Reservation pura.
export type Reservation = components['schemas']['Reservation'];
export type ReservationListItem = components['schemas']['ReservationListItem'];
export type ReservationDetail = components['schemas']['ReservationDetail'];
export type Bill = components['schemas']['Bill'];
export type Room = components['schemas']['Room'];

export interface ReservationPage {
  data: ReservationListItem[];
  total: number;
  page: number;
  limit: number;
}

export interface ReservationListParams {
  from: string;
  to: string;
  page: number;
  limit: number;
}

export interface CreateReservationInput {
  guest_id: string;
  room_id: string;
  extra_room_ids?: string[];
  check_in_date: string;
  check_out_date: string;
}

/**
 * Mensagem que o backend mandou no corpo do erro. Os controllers usam dois formatos:
 * `{ error }` (Error, RoomOccupied) e `{ errors: [] }` (ValidationErrors).
 */
export function serverMessage(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  if ('error' in body && typeof body.error === 'string') return body.error;
  if ('errors' in body && Array.isArray(body.errors)) {
    const parts = body.errors.filter((e): e is string => typeof e === 'string');
    if (parts.length) return parts.join('; ');
  }
  return undefined;
}

/** Erro de reserva com os quartos em conflito, quando o 409 os informa (RoomOccupied). */
export class RoomConflictError extends ApiError {
  constructor(
    message: string,
    readonly roomIds: string[],
  ) {
    super(message, 409);
    this.name = 'RoomConflictError';
  }
}

/**
 * Lista paginada NO SERVIDOR e recortada pelo período (?from=&to=) — a tela nunca baixa o
 * tenant inteiro (princípio 7). Com page/limit o backend responde sempre { data, total, … };
 * o ramo de array só existe porque o Swagger declara os dois formatos no mesmo 200.
 */
export async function listReservations(params: ReservationListParams): Promise<ReservationPage> {
  const { data, error, response } = await api.GET('/reservations', { params: { query: params } });
  if (error || !response.ok || !data) {
    throw new ApiError(serverMessage(error) ?? 'Falha ao carregar reservas.', response.status);
  }
  if (Array.isArray(data)) return { data, total: data.length, page: 1, limit: data.length };
  return {
    data: data.data ?? [],
    total: data.total ?? 0,
    page: data.page ?? params.page,
    limit: data.limit ?? params.limit,
  };
}

export async function getReservation(id: string): Promise<ReservationDetail> {
  const { data, error, response } = await api.GET('/reservations/{id}', { params: { path: { id } } });
  if (error || !response.ok || !data) {
    throw new ApiError(serverMessage(error) ?? 'Reserva não encontrada.', response.status);
  }
  return data;
}

export async function getBill(id: string): Promise<Bill> {
  const { data, error, response } = await api.GET('/reservations/{id}/bill', { params: { path: { id } } });
  if (error || !response.ok || !data) {
    throw new ApiError(serverMessage(error) ?? 'Não foi possível carregar a conta.', response.status);
  }
  return data;
}

/** Quartos livres no período — o backend já descarta OCCUPIED, CLEANING e MAINTENANCE. */
export async function listAvailableRooms(checkIn: string, checkOut: string): Promise<Room[]> {
  const { data, error, response } = await api.GET('/rooms/available', {
    params: { query: { check_in: checkIn, check_out: checkOut } },
  });
  if (error || !response.ok || !data) {
    throw new ApiError(serverMessage(error) ?? 'Falha ao consultar quartos livres.', response.status);
  }
  return data;
}

/**
 * Respostas da criação que a tela trata pelo status, e não pelo texto do servidor:
 * - 409 COM `room_ids`: os quartos foram ocupados por outra reserva → RoomConflictError, e a
 *   tela tira esses quartos da seleção e diz os números;
 * - 409 SEM `room_ids`: deadlock repetido (PR 104) ou corrida barrada pelo EXCLUDE do banco.
 *   Nada foi gravado e o quarto pode estar livre: a seleção fica e a recepção tenta de novo;
 * - 404: quarto, quarto extra, categoria ou hóspede excluído (ou de outro hotel). O texto do
 *   servidor traz o UUID cru do quarto extra, que não diz nada ao balcão.
 */
export const CREATE_RETRY_MESSAGE =
  'Outra operação está usando estes quartos agora e nada foi gravado. Tente de novo — se algum quarto tiver sido reservado nesse meio-tempo, a lista de livres já mostra.';
export const CREATE_GONE_MESSAGE =
  'O hóspede ou um dos quartos escolhidos não existe mais neste hotel — pode ter sido excluído em outro atendimento. As listas foram atualizadas: escolha de novo.';

export async function createReservation(input: CreateReservationInput): Promise<Reservation> {
  const { data, error, response } = await api.POST('/reservations', { body: input });
  if (response.status === 409) {
    const roomIds = error && 'room_ids' in error && Array.isArray(error.room_ids) ? error.room_ids : [];
    if (roomIds.length === 0) throw new ApiError(CREATE_RETRY_MESSAGE, 409);
    throw new RoomConflictError(
      'Outro atendimento acabou de reservar este quarto no mesmo período. Escolha outro quarto livre.',
      roomIds,
    );
  }
  if (response.status === 404) throw new ApiError(CREATE_GONE_MESSAGE, 404);
  if (error || !response.ok || !data) {
    throw new ApiError(serverMessage(error) ?? 'Não foi possível criar a reserva.', response.status);
  }
  return data;
}

export type ReservationTransition = 'check-in' | 'check-out' | 'cancel';

const TRANSITION_FAILURE: Record<ReservationTransition, string> = {
  'check-in': 'Não foi possível fazer o check-in.',
  'check-out': 'Não foi possível fazer o check-out.',
  cancel: 'Não foi possível cancelar a reserva.',
};

/**
 * Transições pelos endpoints dedicados — nunca por PUT /reservations/:id (CLAUDE.md §7).
 * 422 é a máquina de estados do servidor recusando: quase sempre outro atendimento mudou a
 * reserva antes. A mensagem diz isso e a tela recarrega o estado.
 */
export async function transitionReservation(id: string, action: ReservationTransition): Promise<Reservation> {
  const options = { params: { path: { id } } };
  const { data, error, response } =
    action === 'check-in'
      ? await api.PUT('/reservations/{id}/check-in', options)
      : action === 'check-out'
        ? await api.PUT('/reservations/{id}/check-out', options)
        : await api.PUT('/reservations/{id}/cancel', options);

  if (response.status === 422) {
    const detail = serverMessage(error);
    throw new ApiError(
      `A reserva mudou de situação em outro atendimento${detail ? ` (${detail})` : ''}. A tela foi atualizada — confira antes de tentar de novo.`,
      422,
    );
  }
  if (error || !response.ok || !data) {
    throw new ApiError(serverMessage(error) ?? TRANSITION_FAILURE[action], response.status);
  }
  return data;
}
