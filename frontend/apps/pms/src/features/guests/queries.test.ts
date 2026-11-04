import { beforeEach, describe, expect, it, vi } from 'vitest';

// Cliente real trocado por dublê: o teste prende a regra da busca, não a rede.
const api = vi.hoisted(() => ({ GET: vi.fn(), POST: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() }));
vi.mock('../../lib/api.js', () => ({ api }));

import { MIN_SEARCH_TERM, SEARCH_LIMIT, guestKeys, guestSearchOptions, searchTermOf } from './queries.js';

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
