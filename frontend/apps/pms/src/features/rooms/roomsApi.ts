import type { components, paths } from '@hotel/api-client';
import { api } from '../../lib/api.js';
import { ApiError } from '../../lib/http.js';
import { writeErrorMessage, type WriteContext } from './errorMessages.js';

/** Tipos do schema do OpenAPI (components.schemas). Nada redefinido à mão. */
export type Room = components['schemas']['Room'];
export type RoomCategory = components['schemas']['RoomCategory'];
type RoomCreateBody = paths['/rooms']['post']['requestBody']['content']['application/json'];

export interface RoomInput {
  number: string;
  floor: number | null;
  category_id: string;
  status: NonNullable<Room['status']>;
}

export interface CategoryInput {
  name: string;
  capacity: number;
  /** DECIMAL no formato do backend ("150.00"), já convertido por @hotel/domain. */
  price_per_night: string;
}

function fail(ctx: WriteContext, status: number): never {
  throw new ApiError(writeErrorMessage(ctx, status), status);
}

// ─── Quartos ────────────────────────────────────────────────────────────────

export async function listRooms(): Promise<Room[]> {
  const { data, error, response } = await api.GET('/rooms');
  if (error || !response.ok) throw new ApiError('Não foi possível carregar os quartos.', response.status);
  return data ?? [];
}

export async function getRoom(id: string): Promise<Room> {
  const { data, error, response } = await api.GET('/rooms/{id}', { params: { path: { id } } });
  if (error || !response.ok) throw new ApiError('Quarto não encontrado.', response.status);
  return data;
}

export async function createRoom(input: RoomInput): Promise<Room> {
  const body: RoomCreateBody = input;
  const { data, error, response } = await api.POST('/rooms', { body });
  if (error || !response.ok) fail({ entity: 'room', action: 'create', number: input.number }, response.status);
  return data;
}

export async function updateRoom(id: string, input: RoomInput): Promise<Room> {
  const { data, error, response } = await api.PUT('/rooms/{id}', {
    params: { path: { id } },
    // O Swagger de PUT /rooms/{id} não declara requestBody, então o cliente tipa o corpo
    // como `never` — mesmo caso do PUT /guests/{id}. Cast pontual até o Swagger documentar
    // o corpo (pendência registrada no relatório da T-05.1; o conserto é no backend).
    body: input as never,
  });
  if (error || !response.ok) fail({ entity: 'room', action: 'update', number: input.number }, response.status);
  return data;
}

export async function deleteRoom(id: string): Promise<void> {
  const { error, response } = await api.DELETE('/rooms/{id}', { params: { path: { id } } });
  if (error || !response.ok) fail({ entity: 'room', action: 'delete' }, response.status);
}

// ─── Categorias ─────────────────────────────────────────────────────────────

export async function listCategories(): Promise<RoomCategory[]> {
  const { data, error, response } = await api.GET('/room-categories');
  if (error || !response.ok) throw new ApiError('Não foi possível carregar as categorias.', response.status);
  return data ?? [];
}

export async function getCategory(id: string): Promise<RoomCategory> {
  const { data, error, response } = await api.GET('/room-categories/{id}', { params: { path: { id } } });
  if (error || !response.ok) throw new ApiError('Categoria não encontrada.', response.status);
  return data;
}

export async function createCategory(input: CategoryInput): Promise<RoomCategory> {
  const { data, error, response } = await api.POST('/room-categories', { body: input });
  if (error || !response.ok) fail({ entity: 'category', action: 'create' }, response.status);
  return data;
}

export async function updateCategory(id: string, input: CategoryInput): Promise<RoomCategory> {
  const { data, error, response } = await api.PUT('/room-categories/{id}', {
    params: { path: { id } },
    // Mesmo caso do PUT /rooms/{id}: Swagger sem requestBody tipa o corpo como `never`.
    body: input as never,
  });
  if (error || !response.ok) fail({ entity: 'category', action: 'update' }, response.status);
  return data;
}

export async function deleteCategory(id: string): Promise<void> {
  const { error, response } = await api.DELETE('/room-categories/{id}', { params: { path: { id } } });
  if (error || !response.ok) fail({ entity: 'category', action: 'delete' }, response.status);
}
