import type { components } from '@hotel/api-client';
import { api } from '../../lib/api.js';
import { ApiError } from '../../lib/http.js';

export type Tenant = components['schemas']['Tenant'];

/** Quem emite o comprovante: o hotel do usuário logado. */
export interface ReceiptIssuer {
  name: string;
  /** CNPJ como cadastrado; `null` quando o hotel não informou. */
  legalId: string | null;
}

/**
 * O próprio hotel. Sempre `/tenants/me`: o backend resolve o tenant pelo JWT, então o nome
 * nunca vem de um id na URL e não há como pedir o hotel de outro tenant.
 */
export async function getMyTenant(): Promise<Tenant> {
  const { data, error, response } = await api.GET('/tenants/me');
  if (error || !response.ok || !data) {
    throw new ApiError('Não foi possível carregar os dados do hotel.', response.status);
  }
  return data;
}

/**
 * Cabeçalho do comprovante a partir do hotel. Sem nome não há o que mostrar (`null`), e o
 * comprovante sai sem cabeçalho em vez de sair com um título vazio. CNPJ em branco conta como
 * não cadastrado.
 */
export function receiptIssuer(tenant: Tenant | undefined): ReceiptIssuer | null {
  const name = tenant?.name?.trim();
  if (!name) return null;
  const legalId = tenant?.legal_id?.trim();
  return { name, legalId: legalId || null };
}
