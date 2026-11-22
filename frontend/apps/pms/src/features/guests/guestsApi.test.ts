import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ GET: vi.fn(), POST: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() }));
vi.mock('../../lib/api.js', () => ({ api }));

import { createGuest, deleteGuest, updateGuest } from './guestsApi.js';
import { DELETE_GUEST_REASON } from './guestRules.js';

function fail(status: number) {
  return { data: undefined, error: { error: 'x' }, response: { ok: false, status } };
}

beforeEach(() => {
  api.DELETE.mockReset();
  api.POST.mockReset();
  api.PUT.mockReset();
});

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

// SPEC-11, T-11.1: o servidor recusa CPF de dígito errado com 400 e diz o motivo. A tela dizia
// "Não foi possível salvar", e a recepção não sabia o que corrigir.
describe('createGuest e updateGuest — 400 com o motivo do servidor', () => {
  const invalido = { data: undefined, error: { error: 'CPF inválido' }, response: { ok: false, status: 400 } };

  it('cadastro com CPF inválido: mostra "CPF inválido"', async () => {
    api.POST.mockResolvedValue(invalido);
    await expect(createGuest({ full_name: 'Ana', cpf: '529.982.247-24' })).rejects.toMatchObject({ status: 400, message: 'CPF inválido' });
  });

  it('edição com CPF inválido: mostra "CPF inválido"', async () => {
    api.PUT.mockResolvedValue(invalido);
    await expect(updateGuest('g1', { full_name: 'Ana', cpf: '529.982.247-24' })).rejects.toMatchObject({ status: 400, message: 'CPF inválido' });
  });

  it('400 sem corpo: pede para conferir os dados, sem mandar tentar de novo', async () => {
    api.POST.mockResolvedValue({ data: undefined, error: undefined, response: { ok: false, status: 400 } });
    const err = await createGuest({ full_name: 'Ana' }).catch((e: unknown) => e);
    expect((err as Error).message).toMatch(/Confira/);
  });
});
