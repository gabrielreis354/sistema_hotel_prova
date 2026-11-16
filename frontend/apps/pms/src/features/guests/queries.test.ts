import { beforeEach, describe, expect, it, vi } from 'vitest';

// Cliente real trocado por dublê: o teste prende a regra da busca, não a rede.
const api = vi.hoisted(() => ({ GET: vi.fn(), POST: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() }));
vi.mock('../../lib/api.js', () => ({ api }));

import { MIN_SEARCH_TERM, SEARCH_LIMIT, guestKeys, guestDetailOptions, guestSearchOptions, retryGuestDetail, searchTermOf } from './queries.js';
import { ApiError } from '../../lib/http.js';

beforeEach(() => api.GET.mockReset());

describe('searchTermOf — só consulta com termo de verdade', () => {
  it('mínimo de 3 caracteres, sem contar espaços nas pontas', () => {
    expect(MIN_SEARCH_TERM).toBe(3);
    expect(searchTermOf('an')).toBeNull();
    expect(searchTermOf('  an  ')).toBeNull();
    expect(searchTermOf('')).toBeNull();
    expect(searchTermOf(' ana ')).toBe('ana');
  });
});

describe('guestSearchOptions — busca no servidor, nunca a coleção', () => {
  it('termo curto: enabled false (abrir a tela ou digitar 2 letras não consulta nada)', () => {
    expect(guestSearchOptions('').enabled).toBe(false);
    expect(guestSearchOptions('an').enabled).toBe(false);
  });

  it('termo válido: chave própria de busca, nunca a chave da lista inteira', () => {
    const opts = guestSearchOptions(' ana ');
    expect(opts.enabled).toBe(true);
    expect(opts.queryKey).toEqual(['guests', 'search', 'ana']);
    expect(opts.queryKey).not.toEqual(guestKeys.all);
  });

  it('consulta GET /guests com q e limit — nunca sem q (que devolveria o cadastro)', async () => {
    api.GET.mockResolvedValue({ data: [{ id: 'g1', full_name: 'Ana' }], error: undefined, response: { ok: true, status: 200 } });
    await expect(guestSearchOptions('ana').queryFn()).resolves.toEqual([{ id: 'g1', full_name: 'Ana' }]);
    expect(api.GET).toHaveBeenCalledWith('/guests', { params: { query: { q: 'ana', limit: SEARCH_LIMIT } } });
    expect(SEARCH_LIMIT).toBeLessThanOrEqual(20);
  });

  it('erro do servidor vira ApiError com mensagem de busca', async () => {
    api.GET.mockResolvedValue({ data: undefined, error: { error: 'x' }, response: { ok: false, status: 500 } });
    await expect(guestSearchOptions('ana').queryFn()).rejects.toMatchObject({ status: 500, message: 'Falha ao buscar hóspedes.' });
  });
});

describe('retryGuestDetail — 4xx não se repete', () => {
  // A ficha de um hóspede inexistente ficava ~8 s em "Carregando…" repetindo o 404
  // (qa-explorador de 16/11, 🟡-4). 4xx é resposta definitiva; só falha de servidor ou rede repete.
  it('404 e 403: nenhuma nova tentativa', () => {
    expect(retryGuestDetail(0, new ApiError('x', 404))).toBe(false);
    expect(retryGuestDetail(0, new ApiError('x', 403))).toBe(false);
  });

  it('500 e erro de rede: uma nova tentativa, como o padrão do app', () => {
    expect(retryGuestDetail(0, new ApiError('x', 500))).toBe(true);
    expect(retryGuestDetail(1, new ApiError('x', 500))).toBe(false);
    expect(retryGuestDetail(0, new TypeError('Failed to fetch'))).toBe(true);
  });
});

describe('guestDetailOptions — a ficha usa a regra de retry', () => {
  // Sem isto, apagar o `retry` do useGuest não quebrava nenhum teste (redteam de 16/11, 🟢-1).
  it('liga retryGuestDetail e consulta só com id', () => {
    expect(guestDetailOptions('g1').retry).toBe(retryGuestDetail);
    expect(guestDetailOptions('g1').queryKey).toEqual(guestKeys.detail('g1'));
    expect(guestDetailOptions(undefined).enabled).toBe(false);
  });
});
