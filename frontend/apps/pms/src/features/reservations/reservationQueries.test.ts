import { describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ GET: vi.fn(), POST: vi.fn(), PUT: vi.fn() }));
vi.mock('../../lib/api.js', () => ({ api }));

import { reservationListOptions } from './queries.js';

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
