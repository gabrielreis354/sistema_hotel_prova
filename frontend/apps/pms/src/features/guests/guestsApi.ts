import { api } from '../../lib/api.js';
import { ApiError } from '../../lib/http.js';
import type { components } from '@hotel/api-client';
import { DELETE_GUEST_REASON } from './guestRules.js';

/** Tipo do hóspede vindo do schema do OpenAPI (components.schemas.Guest). */
export type Guest = components['schemas']['Guest'];

export interface GuestInput {
  full_name: string;
  cpf?: string;
  phone?: string;
  email?: string;
}

export async function listGuests(): Promise<Guest[]> {
  const { data, error, response } = await api.GET('/guests');
  if (error || !response.ok) throw new ApiError('Falha ao carregar hóspedes.', response.status);
  return data ?? [];
}

/**
 * Busca no servidor (`GET /guests?q=&limit=`): nome, CPF, e-mail ou telefone, sempre no hotel do
 * token, no máximo `limit` resultados. Nunca baixa o cadastro para filtrar no navegador.
 */
export async function searchGuests(q: string, limit: number): Promise<Guest[]> {
  const { data, error, response } = await api.GET('/guests', { params: { query: { q, limit } } });
  if (error || !response.ok) throw new ApiError('Falha ao buscar hóspedes.', response.status);
  return data ?? [];
}

export async function getGuest(id: string): Promise<Guest> {
  const { data, error, response } = await api.GET('/guests/{id}', {
    params: { path: { id } },
  });
  if (error || !response.ok) throw new ApiError('Hóspede não encontrado.', response.status);
  return data;
}

/**
 * 400 do cadastro ou da edição: o servidor diz o que corrigir ("CPF inválido", SPEC-11 T-11.1).
 * Tentar de novo não resolve, então a mensagem não manda tentar.
 */
function invalidGuest(error: unknown): ApiError {
  const reason = (error as { error?: unknown } | undefined)?.error;
  return new ApiError(typeof reason === 'string' && reason ? reason : 'Confira os dados do hóspede.', 400);
}

export async function createGuest(input: GuestInput): Promise<Guest> {
  const { data, error, response } = await api.POST('/guests', { body: input });
  if (response.status === 409) {
    throw new ApiError('CPF ou e-mail já cadastrado para outro hóspede.', 409);
  }
  if (response.status === 400) throw invalidGuest(error);
  if (error || !response.ok) throw new ApiError('Não foi possível salvar o hóspede.', response.status);
  return data;
}

export async function updateGuest(id: string, input: GuestInput): Promise<Guest> {
  const { data, error, response } = await api.PUT('/guests/{id}', {
    params: { path: { id } },
    // Corpo tipado pelo Swagger (requestBody do PUT /guests/{id} declarado na T-05.1).
    body: input,
  });
  if (response.status === 409) {
    throw new ApiError('CPF ou e-mail já cadastrado para outro hóspede.', 409);
  }
  if (response.status === 400) throw invalidGuest(error);
  if (error || !response.ok) throw new ApiError('Não foi possível salvar o hóspede.', response.status);
  return data;
}

export async function deleteGuest(id: string): Promise<void> {
  const { error, response } = await api.DELETE('/guests/{id}', {
    params: { path: { id } },
  });
  // A tela já desabilita para quem não é ADMIN; o 403 cobre papel trocado com a ficha aberta.
  if (response.status === 403) throw new ApiError(DELETE_GUEST_REASON, 403);
  // 409: reserva PENDING, CONFIRMED ou CHECKED_IN (decisão de 16/11). O servidor diz o motivo e o
  // que fazer; tentar de novo não resolve.
  if (response.status === 409) {
    throw new ApiError(error?.error ?? 'Hóspede com reserva ativa não pode ser excluído — encerre ou cancele a reserva antes.', 409);
  }
  if (error || !response.ok) throw new ApiError('Não foi possível remover o hóspede. Tente novamente.', response.status);
}
