import type { components, paths } from '@hotel/api-client';
import { api } from '../../lib/api.js';
import { ApiError } from '../../lib/http.js';

/** Tipos do schema do OpenAPI. Nada redefinido à mão. */
export type Account = components['schemas']['Account'];
export type AccountDetail = components['schemas']['AccountDetail'];
export type AccountItem = components['schemas']['AccountItem'];
export type AccountBill = components['schemas']['AccountBill'];
export type Product = components['schemas']['Product'];
type ItemBody = paths['/accounts/{id}/items']['post']['requestBody']['content']['application/json'];

/** Tipos que o garçom abre (D-8). Suíte nasce no check-in (T-04.6); day-use e interna são da recepção. */
export type WaiterAccountType = 'TABLE' | 'DIRECT';

/** Mensagem do backend (`{ error }`), lida sem cast: o corpo de erro não é tipado no Swagger. */
export function backendMessage(body: unknown, fallback: string): string {
  if (typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string') {
    return body.error;
  }
  return fallback;
}

export async function listOpenAccounts(): Promise<Account[]> {
  const { data, error, response } = await api.GET('/accounts', { params: { query: { status: 'OPEN' } } });
  if (error || !response.ok) throw new ApiError('Não foi possível carregar as contas.', response.status);
  return data ?? [];
}

export async function getAccount(id: string): Promise<AccountDetail> {
  const { data, response } = await api.GET('/accounts/{id}', { params: { path: { id } } });
  if (!response.ok || !data) throw new ApiError('Conta não encontrada.', response.status);
  return data;
}

export async function openAccount(type: WaiterAccountType, label: string): Promise<Account> {
  const { data, error, response } = await api.POST('/accounts', { body: { type, label } });
  if (!response.ok || !data) {
    throw new ApiError(backendMessage(error, 'Não foi possível abrir a conta.'), response.status);
  }
  return data;
}

/** Cardápio ativo (CA-05.5.b), ordenado pelo backend por categoria e nome. */
export async function listMenu(): Promise<Product[]> {
  const { data, error, response } = await api.GET('/products', { params: { query: { active: 'true' } } });
  if (error || !response.ok) throw new ApiError('Não foi possível carregar o cardápio.', response.status);
  return data ?? [];
}

/** Prazo de um envio da fila. Sem ele, uma requisição pendurada segura a fila inteira. */
const POST_TIMEOUT_MS = 10_000;

export type AccountItemResult = components['schemas']['AccountItemResult'];

/**
 * Lançamento vindo da fila. Não lança exceção: a fila decide o que cada resposta significa
 * (queueCore.classifySend). Falha de rede e prazo estourado viram status 'network' — o reenvio
 * é seguro, porque o servidor reconhece o client_item_id (RN-008).
 */
export async function postItem(
  accountId: string,
  body: ItemBody,
): Promise<{ status: number | 'network'; data?: AccountItemResult; body: unknown }> {
  try {
    const { data, error, response } = await api.POST('/accounts/{id}/items', {
      params: { path: { id: accountId } },
      body,
      signal: AbortSignal.timeout(POST_TIMEOUT_MS),
    });
    return { status: response.status, data, body: data ?? error };
  } catch {
    return { status: 'network', body: undefined };
  }
}

export async function getAccountBill(id: string): Promise<AccountBill> {
  const { data, error, response } = await api.GET('/accounts/{id}/bill', { params: { path: { id } } });
  if (!response.ok || !data) {
    throw new ApiError(backendMessage(error, 'Não foi possível carregar a conta.'), response.status);
  }
  return data;
}

export async function closeAccount(id: string): Promise<void> {
  const { error, response } = await api.PUT('/accounts/{id}/close', { params: { path: { id } } });
  if (error || !response.ok) {
    throw new ApiError(backendMessage(error, 'Não foi possível fechar a conta.'), response.status);
  }
}
