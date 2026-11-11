import { createApiClient } from '@hotel/api-client';
import { afterEach, describe, expect, it, vi } from 'vitest';

// O app decide se o 401 encerra a sessão olhando a rota e o token da requisição que falhou. Se o
// cliente deixar de informar um deles, a regra de endSessionOnUnauthorized perde o efeito.
afterEach(() => vi.unstubAllGlobals());

function respondendo(status: number) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status })));
}

describe('createApiClient em respostas 401', () => {
  it('informa a rota e o token da requisição que falhou, mesmo que o token já tenha mudado', async () => {
    respondendo(401);
    let token = 'token-velho';
    const onUnauthorized = vi.fn();
    const client = createApiClient({ baseUrl: 'http://api.test', getToken: () => token, onUnauthorized });

    const pedido = client.GET('/guests');
    token = 'token-novo';
    await pedido;

    expect(onUnauthorized).toHaveBeenCalledWith({ path: '/guests', token: 'token-velho' });
  });

  it('sem token enviado, informa token nulo', async () => {
    respondendo(401);
    const onUnauthorized = vi.fn();
    const client = createApiClient({ baseUrl: 'http://api.test', onUnauthorized });

    await client.POST('/auth/login', { body: { email: 'a@a.test', password: 'x' } });

    expect(onUnauthorized).toHaveBeenCalledWith({ path: '/auth/login', token: null });
  });

  it('outros status não chamam o aviso', async () => {
    respondendo(200);
    const onUnauthorized = vi.fn();
    const client = createApiClient({ baseUrl: 'http://api.test', onUnauthorized });

    await client.GET('/guests');

    expect(onUnauthorized).not.toHaveBeenCalled();
  });
});
