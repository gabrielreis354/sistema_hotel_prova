import { beforeEach, describe, expect, it, vi } from 'vitest';

// O cliente real (openapi-fetch + store de sessão) é trocado por dublê: aqui se testa só o que
// o módulo faz com cada resposta de /tenants/me.
const api = vi.hoisted(() => ({ GET: vi.fn() }));
vi.mock('../../lib/api.js', () => ({ api }));

import { ApiError } from '../../lib/http.js';
import { getMyTenant, receiptIssuer } from './tenantApi.js';

function reply(status: number, body: unknown) {
  const ok = status >= 200 && status < 300;
  return { data: ok ? body : undefined, error: ok ? undefined : body, response: { status, ok } };
}

beforeEach(() => {
  api.GET.mockReset();
});

describe('getMyTenant', () => {
  it('pede sempre /tenants/me, sem id de tenant, e devolve o hotel', async () => {
    api.GET.mockResolvedValue(reply(200, { id: 't1', name: 'Pousada Aurora', legal_id: '12.345.678/0001-90' }));
    await expect(getMyTenant()).resolves.toMatchObject({ name: 'Pousada Aurora' });
    expect(api.GET).toHaveBeenCalledWith('/tenants/me');
  });

  it('500 vira ApiError com o status', async () => {
    api.GET.mockResolvedValue(reply(500, { error: 'Erro interno do servidor' }));
    const err = await getMyTenant().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 500 });
  });
});

describe('receiptIssuer — cabeçalho do comprovante', () => {
  it('com nome e CNPJ', () => {
    expect(receiptIssuer({ name: 'Pousada Aurora', legal_id: '12.345.678/0001-90' })).toEqual({
      name: 'Pousada Aurora',
      legalId: '12.345.678/0001-90',
    });
  });

  it('sem CNPJ (nulo, ausente ou em branco): só o nome', () => {
    expect(receiptIssuer({ name: 'Hotel Sol', legal_id: null })).toEqual({ name: 'Hotel Sol', legalId: null });
    expect(receiptIssuer({ name: 'Hotel Sol' })).toEqual({ name: 'Hotel Sol', legalId: null });
    expect(receiptIssuer({ name: 'Hotel Sol', legal_id: '  ' })).toEqual({ name: 'Hotel Sol', legalId: null });
  });

  it('sem dados (carregando ou falhou) ou sem nome: nada de cabeçalho', () => {
    expect(receiptIssuer(undefined)).toBeNull();
    expect(receiptIssuer({ name: '   ', legal_id: '12.345.678/0001-90' })).toBeNull();
  });
});
