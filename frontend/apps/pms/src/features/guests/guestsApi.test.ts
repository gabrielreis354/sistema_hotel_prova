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

  it('409: o motivo do servidor (reserva ativa, decisão de 16/11), não um palpite', async () => {
    const motivo = 'Hóspede com reserva ativa não pode ser excluído — encerre ou cancele a reserva antes';
    api.DELETE.mockResolvedValue({ data: undefined, error: { error: motivo }, response: { ok: false, status: 409 } });
    await expect(deleteGuest('g1')).rejects.toMatchObject({ status: 409, message: motivo });
  });

  it('409 sem corpo: texto próprio, sem mandar tentar de novo', async () => {
    api.DELETE.mockResolvedValue({ data: undefined, error: undefined, response: { ok: false, status: 409 } });
    const err = await deleteGuest('g1').catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 409 });
    expect((err as Error).message).toMatch(/reserva ativa/);
    expect((err as Error).message).not.toMatch(/tente/i);
  });

  it('500 mantém a mensagem de antes', async () => {
    api.DELETE.mockResolvedValue(fail(500));
    await expect(deleteGuest('g1')).rejects.toThrow(/Tente novamente/);
  });
});
