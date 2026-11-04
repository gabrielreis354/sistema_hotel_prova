import type { components, paths } from '@hotel/api-client';
import { api } from '../../lib/api.js';
import { ApiError } from '../../lib/http.js';
import { writeErrorMessage, type WriteContext } from './errorMessages.js';
import { toRoomCreateBody } from './roomRules.js';

/** Tipos do schema do OpenAPI (components.schemas). Nada redefinido à mão. */
export type Room = components['schemas']['Room'];
export type RoomCategory = components['schemas']['RoomCategory'];
/** Corpo do POST /rooms: quarto novo só nasce AVAILABLE ou MAINTENANCE (o contrato estreita o status). */
export type RoomCreateBody = paths['/rooms']['post']['requestBody']['content']['application/json'];
/** Corpo do PUT /rooms/{id}: parcial — só o que mudou (ver changedRoomFields). */
export type RoomUpdateBody = paths['/rooms/{id}']['put']['requestBody']['content']['application/json'];
type CategoryUpdateBody = paths['/room-categories/{id}']['put']['requestBody']['content']['application/json'];

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

/** Corpo de erro (`error`) entra como unknown: o motivo sai do `code`, lido sem cast. */
function fail(ctx: WriteContext, status: number, body: unknown): never {
  throw new ApiError(writeErrorMessage(ctx, status, body), status);
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
  const body = toRoomCreateBody(input);
  // Fail fast: o formulário já desabilita Ocupado e Em limpeza no cadastro; se chegar aqui,
  // é bug de tela — melhor dizer o motivo do que mandar e receber o 400 do servidor.
  if (!body) throw new ApiError('Quarto novo começa Livre ou Em manutenção. Ocupado e Em limpeza vêm do check-in e do check-out.', 400);
  const { data, error, response } = await api.POST('/rooms', { body });
  if (error || !response.ok) fail({ entity: 'room', action: 'create', number: input.number }, response.status, error);
  return data;
}

export async function updateRoom(id: string, changes: RoomUpdateBody, number?: string): Promise<Room> {
  const { data, error, response } = await api.PUT('/rooms/{id}', {
    params: { path: { id } },
    body: changes,
  });
  if (error || !response.ok) fail({ entity: 'room', action: 'update', number }, response.status, error);
  return data;
}

export async function deleteRoom(id: string): Promise<void> {
  const { error, response } = await api.DELETE('/rooms/{id}', { params: { path: { id } } });
  if (error || !response.ok) fail({ entity: 'room', action: 'delete' }, response.status, error);
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
  if (error || !response.ok) fail({ entity: 'category', action: 'create' }, response.status, error);
  return data;
}

export async function updateCategory(id: string, input: CategoryInput): Promise<RoomCategory> {
  const body: CategoryUpdateBody = input;
  const { data, error, response } = await api.PUT('/room-categories/{id}', {
    params: { path: { id } },
    body,
  });
  if (error || !response.ok) fail({ entity: 'category', action: 'update' }, response.status, error);
  return data;
}

export async function deleteCategory(id: string): Promise<void> {
  const { error, response } = await api.DELETE('/room-categories/{id}', { params: { path: { id } } });
  if (error || !response.ok) fail({ entity: 'category', action: 'delete' }, response.status, error);
}
