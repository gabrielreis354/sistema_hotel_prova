import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ GET: vi.fn(), POST: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() }));
vi.mock('../../lib/api.js', () => ({ api }));

import { deleteGuest } from './guestsApi.js';
import { DELETE_GUEST_REASON } from './guestRules.js';

function fail(status: number) {
  return { data: undefined, error: { error: 'x' }, response: { ok: false, status } };
}

beforeEach(() => api.DELETE.mockReset());

describe('deleteGuest — mensagem pelo motivo da recusa', () => {
  it('403: diz que só o administrador exclui, não "tente novamente" (qa-explorador de 16/11)', async () => {
    api.DELETE.mockResolvedValue(fail(403));
    const err = await deleteGuest('g1').catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 403, message: DELETE_GUEST_REASON });
  });

  it('409 e 500 mantêm as mensagens de antes', async () => {
    api.DELETE.mockResolvedValue(fail(409));
    await expect(deleteGuest('g1')).rejects.toThrow(/reservas vinculadas/);
    api.DELETE.mockResolvedValue(fail(500));
    await expect(deleteGuest('g1')).rejects.toThrow(/Tente novamente/);
  });
});
