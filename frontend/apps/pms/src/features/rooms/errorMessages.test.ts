import { describe, it, expect } from 'vitest';
import { messageOf, readErrorBody, writeErrorMessage } from './errorMessages.js';
import { ApiError } from '../../lib/http.js';

const room = { entity: 'room', action: 'update', number: '101' } as const;
const roomCreate = { entity: 'room', action: 'create', number: '101' } as const;
const roomDelete = { entity: 'room', action: 'delete' } as const;
const catUpdate = { entity: 'category', action: 'update' } as const;
const catDelete = { entity: 'category', action: 'delete' } as const;

describe('writeErrorMessage — motivo pelo code do backend', () => {
  it('ROOM_NUMBER_TAKEN cita o numero digitado', () => {
    expect(writeErrorMessage(roomCreate, 409, { code: 'ROOM_NUMBER_TAKEN' })).toBe(
      'Já existe um quarto 101 neste hotel. Use outro número.',
    );
    expect(writeErrorMessage({ entity: 'room', action: 'update' }, 409, { code: 'ROOM_NUMBER_TAKEN' })).toMatch(
      /Use outro número/,
    );
  });

  it('ROOM_STATUS_TRANSITION_NOT_ALLOWED explica a mudanca paralela, nao fala de numero', () => {
    const msg = writeErrorMessage(room, 409, { code: 'ROOM_STATUS_TRANSITION_NOT_ALLOWED', error: 'x' });
    expect(msg).toMatch(/status do quarto mudou enquanto você editava/);
    expect(msg).not.toMatch(/número/);
  });

  it('ROOM_IN_USE na exclusao de quarto', () => {
    expect(writeErrorMessage(roomDelete, 409, { code: 'ROOM_IN_USE' })).toBe(
      'Este quarto está em uso (hóspede ou reserva) e não pode ser excluído agora.',
    );
  });

  it('CATEGORY_IN_USE na exclusao de categoria', () => {
    expect(writeErrorMessage(catDelete, 409, { code: 'CATEGORY_IN_USE' })).toBe(
      'Esta categoria ainda tem quartos. Mude a categoria desses quartos e tente excluir de novo.',
    );
  });

  it('CATEGORY_NAME_TAKEN pede outro nome', () => {
    expect(writeErrorMessage(catUpdate, 409, { code: 'CATEGORY_NAME_TAKEN' })).toBe(
      'Já existe uma categoria com esse nome neste hotel. Use outro nome.',
    );
  });

  it('CATEGORY_NOT_FOUND no PUT de quarto fala da categoria, nao do quarto (🟢-1)', () => {
    expect(writeErrorMessage(room, 404, { code: 'CATEGORY_NOT_FOUND' })).toBe(
      'A categoria escolhida não existe mais. Recarregue a página e escolha outra.',
    );
    expect(writeErrorMessage(roomCreate, 404, { code: 'CATEGORY_NOT_FOUND' })).toMatch(/categoria escolhida/);
    expect(writeErrorMessage(catUpdate, 404, { code: 'CATEGORY_NOT_FOUND' })).toMatch(/Esta categoria não existe mais/);
  });

  it('INVALID_INPUT nomeia o campo quando vem field', () => {
    expect(writeErrorMessage(room, 400, { code: 'INVALID_INPUT', field: 'floor' })).toBe(
      'Confira o campo Andar: valor faltando ou fora do formato.',
    );
    expect(writeErrorMessage(catUpdate, 400, { code: 'INVALID_INPUT', field: 'price_per_night' })).toMatch(/Diária/);
    expect(writeErrorMessage(room, 400, { code: 'INVALID_INPUT' })).toBe(
      'Confira os campos: há informação faltando ou fora do formato.',
    );
    expect(writeErrorMessage(room, 400, { code: 'INVALID_INPUT', field: 'campo_novo' })).toMatch(/Confira os campos/);
  });
});

describe('writeErrorMessage — sem code conhecido nao adivinha pelo status', () => {
  it('409 sem code nao vira "numero duplicado": repassa o texto do servidor', () => {
    const msg = writeErrorMessage(room, 409, { error: 'Conflito qualquer.' });
    expect(msg).toBe('O sistema recusou salvar o quarto: Conflito qualquer.');
    expect(msg).not.toMatch(/outro número/);
  });

  it('404 sem code nao afirma o que sumiu', () => {
    expect(writeErrorMessage(room, 404, undefined)).toBe(
      'O sistema recusou salvar o quarto. Recarregue a página e confira os dados.',
    );
  });

  it('code desconhecido cai na generica', () => {
    expect(writeErrorMessage(catDelete, 409, { code: 'ALGO_NOVO', error: 'Motivo novo' })).toBe(
      'O sistema recusou excluir a categoria: Motivo novo.',
    );
  });

  it('403 explica o papel', () => {
    expect(writeErrorMessage(roomDelete, 403, { error: 'Forbidden' })).toMatch(/administrador/);
  });

  it('5xx diz o verbo certo e nao culpa a conexao', () => {
    expect(writeErrorMessage(roomDelete, 500, undefined)).toBe(
      'O sistema não conseguiu excluir o quarto. Tente de novo; se continuar, avise o suporte.',
    );
    expect(writeErrorMessage({ entity: 'category', action: 'create' }, 502, {})).not.toMatch(/conexão/);
  });
});

describe('readErrorBody', () => {
  it('le so strings, sem confiar no formato', () => {
    expect(readErrorBody({ code: 'ROOM_IN_USE', field: 'status', error: 'x' })).toEqual({
      code: 'ROOM_IN_USE',
      field: 'status',
      detail: 'x',
    });
    expect(readErrorBody({ code: 42, error: '' })).toEqual({ code: undefined, field: undefined, detail: undefined });
    expect(readErrorBody(null)).toEqual({});
    expect(readErrorBody('texto')).toEqual({});
  });
});

describe('messageOf', () => {
  it('falha de rede (fetch rejeitado) fala da conexao', () => {
    expect(messageOf(new TypeError('Failed to fetch'))).toMatch(/conexão/);
    expect(messageOf(new ApiError('x', 500))).toBe('x');
  });
});
