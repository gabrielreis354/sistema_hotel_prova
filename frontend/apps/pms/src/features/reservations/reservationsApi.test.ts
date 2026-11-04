import { beforeEach, describe, expect, it, vi } from 'vitest';

// O cliente real (openapi-fetch + store de sessão) é trocado por dublês: aqui se testa só o
// que o módulo faz com cada resposta — o contrato 409/422 que a tela depende para falar com o balcão.
const api = vi.hoisted(() => ({ GET: vi.fn(), POST: vi.fn(), PUT: vi.fn() }));
vi.mock('../../lib/api.js', () => ({ api }));

import { ApiError } from '../../lib/http.js';
import {
  RoomConflictError,
  createReservation,
  listReservations,
  serverMessage,
  transitionReservation,
} from './reservationsApi.js';

function reply(status: number, body: unknown) {
  const ok = status >= 200 && status < 300;
  return { data: ok ? body : undefined, error: ok ? undefined : body, response: { status, ok } };
}

const input = {
  guest_id: 'g1',
  room_id: 'r1',
  extra_room_ids: ['r2'],
  check_in_date: '2026-11-20',
  check_out_date: '2026-11-23',
};

beforeEach(() => {
  api.GET.mockReset();
  api.POST.mockReset();
  api.PUT.mockReset();
});

describe('serverMessage', () => {
  it('lê { error } e { errors: [] }, e ignora o que não reconhece', () => {
    expect(serverMessage({ error: 'Quarto não encontrado' })).toBe('Quarto não encontrado');
    expect(serverMessage({ errors: ['guest_id obrigatório', 'room_id obrigatório'] })).toBe(
      'guest_id obrigatório; room_id obrigatório',
    );
    expect(serverMessage({ errors: [] })).toBeUndefined();
    expect(serverMessage(null)).toBeUndefined();
    expect(serverMessage('texto')).toBeUndefined();
  });
});

describe('createReservation — 409 de corrida', () => {
  it('409 com room_ids vira RoomConflictError com os quartos perdidos', async () => {
    api.POST.mockResolvedValue(reply(409, { error: 'Quarto indisponível', room_ids: ['r2'] }));
    const err = await createReservation(input).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RoomConflictError);
    expect(err).toMatchObject({ status: 409, roomIds: ['r2'] });
    expect((err as Error).message).toMatch(/Outro atendimento/);
  });

  it('409 sem room_ids (deadlock repetido ou corrida barrada pelo EXCLUDE) pede para tentar de novo, sem acusar quarto ocupado', async () => {
    // Desde o PR 104 o backend repete a operação uma vez no deadlock (40P01) e, se ele se
    // repetir, responde 409 SEM room_ids. Nada foi gravado e o quarto pode estar livre: dizer
    // "outro atendimento reservou" mandava a recepção trocar de quarto à toa.
    for (const body of [
      { error: 'Outra operação está usando estes quartos agora — tente de novo' },
      { error: 'Quarto indisponível no período solicitado' },
    ]) {
      api.POST.mockResolvedValueOnce(reply(409, body));
      const err = await createReservation(input).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ApiError);
      expect(err).not.toBeInstanceOf(RoomConflictError);
      expect(err).toMatchObject({ status: 409 });
      expect((err as Error).message).toMatch(/nada foi gravado/i);
      expect((err as Error).message).toMatch(/tente de novo/i);
      expect((err as Error).message).not.toMatch(/acabou de reservar/);
    }
  });

  it('404 (quarto, categoria ou hóspede excluído ou de outro hotel) explica e não mostra o id cru', async () => {
    for (const body of [
      { error: 'Quarto extra não encontrado: 0b6f2a8e-1111-4c2d-9a3e-5f6a7b8c9d0e' },
      { error: 'Quarto não encontrado' },
      { error: 'Hóspede não encontrado' },
    ]) {
      api.POST.mockResolvedValueOnce(reply(404, body));
      const err = await createReservation(input).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ApiError);
      expect(err).toMatchObject({ status: 404 });
      expect((err as Error).message).toMatch(/não existe mais neste hotel/);
      expect((err as Error).message).toMatch(/escolha de novo/i);
      expect((err as Error).message).not.toMatch(/0b6f2a8e/);
    }
  });

  it('400 de validação traz as mensagens do servidor; 500 cai na mensagem genérica', async () => {
    api.POST.mockResolvedValueOnce(reply(400, { errors: ['check_out_date deve ser posterior a check_in_date'] }));
    await expect(createReservation(input)).rejects.toMatchObject({
      status: 400,
      message: 'check_out_date deve ser posterior a check_in_date',
    });
    api.POST.mockResolvedValueOnce(reply(500, {}));
    const err = await createReservation(input).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).not.toBeInstanceOf(RoomConflictError);
    expect(err).toMatchObject({ status: 500, message: 'Não foi possível criar a reserva.' });
  });

  it('201 devolve a reserva e manda principal e extras no corpo', async () => {
    api.POST.mockResolvedValue(reply(201, { id: 'res1', status: 'PENDING' }));
    await expect(createReservation(input)).resolves.toEqual({ id: 'res1', status: 'PENDING' });
    expect(api.POST).toHaveBeenCalledWith('/reservations', { body: input });
  });
});

describe('transitionReservation — 422 da máquina de estados', () => {
  it('422 explica que outro atendimento mudou a reserva, com o motivo do servidor', async () => {
    api.PUT.mockResolvedValue(reply(422, { error: "Check-in não permitido no status 'CANCELLED'" }));
    await expect(transitionReservation('res1', 'check-in')).rejects.toMatchObject({
      status: 422,
      message: expect.stringMatching(/mudou de situação em outro atendimento \(Check-in não permitido/),
    });
  });

  it('chama o endpoint dedicado de cada ação — nunca PUT /reservations/{id}', async () => {
    api.PUT.mockResolvedValue(reply(200, { id: 'res1' }));
    await transitionReservation('res1', 'check-in');
    await transitionReservation('res1', 'check-out');
    await transitionReservation('res1', 'cancel');
    expect(api.PUT.mock.calls.map((c) => c[0])).toEqual([
      '/reservations/{id}/check-in',
      '/reservations/{id}/check-out',
      '/reservations/{id}/cancel',
    ]);
  });

  it('409 do cancelamento (reserva-bloco de contrato) mostra a mensagem do servidor', async () => {
    api.PUT.mockResolvedValue(reply(409, { error: 'Reserva-bloco de contrato: cancele pelo contrato' }));
    await expect(transitionReservation('res1', 'cancel')).rejects.toMatchObject({
      status: 409,
      message: 'Reserva-bloco de contrato: cancele pelo contrato',
    });
  });
});

describe('listReservations', () => {
  it('pede período e página ao servidor e normaliza { data, total, page, limit }', async () => {
    api.GET.mockResolvedValue(reply(200, { data: [{ id: 'a' }], total: 41, page: 2, limit: 20 }));
    const page = await listReservations({ from: '2026-10-01', to: '2026-10-31', page: 2, limit: 20 });
    expect(page).toEqual({ data: [{ id: 'a' }], total: 41, page: 2, limit: 20 });
    expect(api.GET).toHaveBeenCalledWith('/reservations', {
      params: { query: { from: '2026-10-01', to: '2026-10-31', page: 2, limit: 20 } },
    });
  });
});
