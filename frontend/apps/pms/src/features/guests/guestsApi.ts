import { api } from '../../lib/api.js';
import { ApiError } from '../../lib/http.js';
import type { components } from '@hotel/api-client';

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
  return (data as unknown as Guest[]) ?? [];
}

export async function getGuest(id: string): Promise<Guest> {
  const { data, error, response } = await api.GET('/guests/{id}', {
    params: { path: { id } },
  });
  if (error || !response.ok) throw new ApiError('Hóspede não encontrado.', response.status);
  return data as unknown as Guest;
}

export async function createGuest(input: GuestInput): Promise<Guest> {
  const { data, error, response } = await api.POST('/guests', { body: input });
  if (response.status === 409) {
    throw new ApiError('CPF ou e-mail já cadastrado para outro hóspede.', 409);
  }
  if (error || !response.ok) throw new ApiError('Não foi possível salvar o hóspede.', response.status);
  return data as unknown as Guest;
}

export async function updateGuest(id: string, input: GuestInput): Promise<Guest> {
  const { data, error, response } = await api.PUT('/guests/{id}', {
    params: { path: { id } },
    // O Swagger de PUT /guests/{id} não declara requestBody, então o cliente tipa o corpo
    // como `never`. Cast pontual até o backend documentar o body (pendência registrada).
    body: input as never,
  });
  if (response.status === 409) {
    throw new ApiError('CPF ou e-mail já cadastrado para outro hóspede.', 409);
  }
  if (error || !response.ok) throw new ApiError('Não foi possível salvar o hóspede.', response.status);
  return data as unknown as Guest;
}

export async function deleteGuest(id: string): Promise<void> {
  const { error, response } = await api.DELETE('/guests/{id}', {
    params: { path: { id } },
  });
  if (error || !response.ok) throw new ApiError('Não foi possível remover o hóspede.', response.status);
}
