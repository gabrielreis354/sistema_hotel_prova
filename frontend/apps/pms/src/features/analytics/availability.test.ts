import { describe, expect, it } from 'vitest';
import { allSourcesDown } from './availability.js';

// Um aviso só quando o analytics cai inteiro (P3 do audit da F2, F7 da SPEC-10): 7 faixas iguais
// diziam a mesma coisa. Falha parcial continua no bloco.
describe('allSourcesDown', () => {
  it('todas as consultas em erro: fora do ar', () => {
    expect(allSourcesDown([{ isError: true }, { isError: true }])).toBe(true);
  });
  it('uma de pé basta para não ser queda geral', () => {
    expect(allSourcesDown([{ isError: true }, { isError: false }])).toBe(false);
  });
  it('lista vazia não é queda', () => {
    expect(allSourcesDown([])).toBe(false);
  });
});
