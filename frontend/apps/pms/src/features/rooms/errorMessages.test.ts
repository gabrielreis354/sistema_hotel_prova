import { describe, it, expect } from 'vitest';
import { messageOf, writeErrorMessage } from './errorMessages.js';
import { ApiError } from '../../lib/http.js';

describe('writeErrorMessage', () => {
  it('409 de quarto cita o numero digitado', () => {
    expect(writeErrorMessage({ entity: 'room', action: 'create', number: '101' }, 409)).toBe(
      'Já existe um quarto 101 neste hotel. Use outro número.',
    );
  });

  it('409 de quarto sem numero ainda orienta', () => {
    expect(writeErrorMessage({ entity: 'room', action: 'update' }, 409)).toMatch(/Use outro número/);
  });

  it('409 de categoria pede outro nome', () => {
    expect(writeErrorMessage({ entity: 'category', action: 'create' }, 409)).toMatch(/Use outro nome/);
  });

  it('400 e 422 pedem para conferir os campos', () => {
    for (const s of [400, 422]) {
      expect(writeErrorMessage({ entity: 'category', action: 'update' }, s)).toMatch(/Confira os campos/);
    }
  });

  it('404 no cadastro de quarto aponta a categoria sumida', () => {
    expect(writeErrorMessage({ entity: 'room', action: 'create' }, 404)).toMatch(/categoria escolhida/);
    expect(writeErrorMessage({ entity: 'room', action: 'update' }, 404)).toMatch(/Este quarto não existe/);
    expect(writeErrorMessage({ entity: 'category', action: 'delete' }, 404)).toMatch(/Esta categoria/);
  });

  it('403 explica o papel', () => {
    expect(writeErrorMessage({ entity: 'room', action: 'delete' }, 403)).toMatch(/administrador/);
  });

  it('409 na exclusao e "em uso", nao duplicidade', () => {
    expect(writeErrorMessage({ entity: 'category', action: 'delete' }, 409)).toBe(
      'Esta categoria ainda tem quartos. Mude a categoria desses quartos e tente excluir de novo.',
    );
    expect(writeErrorMessage({ entity: 'room', action: 'delete' }, 409)).toMatch(/em uso/);
    expect(writeErrorMessage({ entity: 'category', action: 'delete' }, 409)).not.toMatch(/nome/);
  });

  it('5xx diz o verbo certo e nao culpa a conexao', () => {
    expect(writeErrorMessage({ entity: 'room', action: 'delete' }, 500)).toBe(
      'O sistema não conseguiu excluir o quarto. Tente de novo; se continuar, avise o suporte.',
    );
    expect(writeErrorMessage({ entity: 'category', action: 'create' }, 502)).toMatch(/salvar a categoria/);
    expect(writeErrorMessage({ entity: 'category', action: 'create' }, 500)).not.toMatch(/conexão/);
  });

  it('falha de rede (fetch rejeitado) fala da conexao', () => {
    expect(messageOf(new TypeError('Failed to fetch'))).toMatch(/conexão/);
    expect(messageOf(new ApiError('x', 500))).toBe('x');
  });
});
