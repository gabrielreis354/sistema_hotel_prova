import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ GET: vi.fn(), POST: vi.fn(), PUT: vi.fn() }));
vi.mock('../../lib/api.js', () => ({ api }));

import { ApiError } from '../../lib/http.js';
import { freshBillOptions, invalidateAfterCreate, reservationKeys, reservationListOptions } from './queries.js';

// 🟡-1 do qa-redteam da T-05.3: a confirmação do check-out mostrava o saldo do cache.
describe('freshBillOptions — o saldo da confirmação nunca sai do cache', () => {
  it('com a conta em cache e dentro do staleTime padrão, busca de novo e reporta isFetching', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: false } } });
    qc.setQueryData(reservationKeys.bill('r1'), { balance_due: '0.00' });
    api.GET.mockClear();
    api.GET.mockReturnValue(new Promise(() => undefined));

    const observer = new QueryObserver(qc, freshBillOptions('r1'));
    const unsubscribe = observer.subscribe(() => undefined);

    expect(api.GET).toHaveBeenCalledTimes(1);
    expect(observer.getCurrentResult().isFetching).toBe(true);
    unsubscribe();
    qc.clear();
  });

  it('sem id não busca', () => {
    expect(freshBillOptions(undefined).enabled).toBe(false);
  });
});

describe('reservationListOptions — período inválido não vai ao servidor', () => {
  const base = { page: 1, limit: 20 };

  it('de > até: enabled false', () => {
    expect(reservationListOptions({ ...base, from: '2026-10-31', to: '2026-10-01' }).enabled).toBe(false);
  });

  it('de = até (um dia só) e de < até: enabled true', () => {
    expect(reservationListOptions({ ...base, from: '2026-10-21', to: '2026-10-21' }).enabled).toBe(true);
    expect(reservationListOptions({ ...base, from: '2026-10-01', to: '2026-10-31' }).enabled).toBe(true);
  });

  it('a chave inclui período e página (trocar a página não reaproveita o recorte anterior)', () => {
    const a = reservationListOptions({ ...base, from: '2026-10-01', to: '2026-10-31' }).queryKey;
    const b = reservationListOptions({ ...base, page: 2, from: '2026-10-01', to: '2026-10-31' }).queryKey;
    expect(a).not.toEqual(b);
  });
});

describe('invalidateAfterCreate — o que a criação deixa desatualizado', () => {
  const keysAfter = (error: unknown) => {
    const qc = { invalidateQueries: vi.fn() };
    invalidateAfterCreate(qc, error);
    return qc.invalidateQueries.mock.calls.map(([f]) => (f as { queryKey: unknown[] }).queryKey);
  };

  it('sucesso ou 409: reservas e quartos, sem recarregar hóspedes', () => {
    expect(keysAfter(null)).toEqual([['reservations'], ['rooms']]);
    expect(keysAfter(new ApiError('x', 409))).toEqual([['reservations'], ['rooms']]);
  });

  it('404 (hóspede ou quarto excluído): também a busca de hóspedes', () => {
    expect(keysAfter(new ApiError('x', 404))).toEqual([['reservations'], ['rooms'], ['guests']]);
  });
});
