import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/http.js';

/**
 * A trava de "categoria em uso" e "quarto em uso" é do servidor (409 com code), não do
 * cliente: a exclusão faz UMA chamada (DELETE) e a mensagem sai do code. Nada de baixar a
 * lista de quartos para decidir antes (🟡-3 do qa-redteam).
 *
 * O fetch é trocado antes de importar o cliente — o openapi-fetch guarda o fetch global na
 * criação.
 */
const fetchMock = vi.fn<(req: Request) => Promise<Response>>();
let roomsApi: typeof import('./roomsApi.js');

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

beforeAll(async () => {
  vi.stubGlobal('fetch', fetchMock);
  // Em teste não há proxy do Vite: URL absoluta para o Request do openapi-fetch.
  vi.stubEnv('VITE_API_URL', 'http://pms.test/api');
  roomsApi = await import('./roomsApi.js');
});

afterEach(() => fetchMock.mockReset());

async function rejection(p: Promise<unknown>): Promise<ApiError> {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  if (!(err instanceof ApiError)) throw new Error(`esperava ApiError, veio ${String(err)}`);
  return err;
}

describe('exclusão confia no 409 do servidor', () => {
  it('categoria com quartos: 409 CATEGORY_IN_USE vira a mensagem do code, numa chamada só', async () => {
    fetchMock.mockResolvedValueOnce(json(409, { error: 'Categoria em uso por 2 quarto(s)', code: 'CATEGORY_IN_USE' }));

    const err = await rejection(roomsApi.deleteCategory('c1'));

    expect(err.status).toBe(409);
    expect(err.message).toBe('Esta categoria ainda tem quartos. Mude a categoria desses quartos e tente excluir de novo.');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const req = fetchMock.mock.calls[0]?.[0];
    expect(req?.method).toBe('DELETE');
    expect(req?.url).toMatch(/\/room-categories\/c1$/);
  });

  it('categoria livre: 204 resolve sem erro', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(roomsApi.deleteCategory('c2')).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('quarto em uso: 409 ROOM_IN_USE', async () => {
    fetchMock.mockResolvedValueOnce(json(409, { error: 'Quarto em uso', code: 'ROOM_IN_USE' }));
    const err = await rejection(roomsApi.deleteRoom('r1'));
    expect(err.message).toMatch(/em uso \(hóspede ou reserva\)/);
  });
});

describe('escrita lê code e field do corpo real', () => {
  it('PUT de quarto com transição proibida (409) não fala de número', async () => {
    fetchMock.mockResolvedValueOnce(
      json(409, { error: 'Transição não permitida', code: 'ROOM_STATUS_TRANSITION_NOT_ALLOWED' }),
    );
    const err = await rejection(roomsApi.updateRoom('r1', { status: 'MAINTENANCE' }, '101'));
    expect(err.message).toMatch(/status do quarto mudou/);
    expect(err.message).not.toMatch(/número/);
  });

  it('PUT de categoria com 400 INVALID_INPUT nomeia o campo', async () => {
    fetchMock.mockResolvedValueOnce(
      json(400, {
        error: 'capacity deve ser um número inteiro maior ou igual a 1',
        code: 'INVALID_INPUT',
        field: 'capacity',
        errors: ['capacity deve ser um número inteiro maior ou igual a 1'],
      }),
    );
    const err = await rejection(roomsApi.updateCategory('c1', { name: 'Std', capacity: 0, price_per_night: '1.00' }));
    expect(err.message).toBe('Confira o campo Capacidade: valor faltando ou fora do formato.');
  });

  it('POST de quarto com categoria sumida (404 CATEGORY_NOT_FOUND)', async () => {
    fetchMock.mockResolvedValueOnce(json(404, { error: 'Categoria não encontrada', code: 'CATEGORY_NOT_FOUND' }));
    const err = await rejection(
      roomsApi.createRoom({ number: '101', floor: 1, category_id: 'c9', status: 'AVAILABLE' }),
    );
    expect(err.message).toMatch(/categoria escolhida não existe mais/);
  });
});
