import { describe, expect, it } from 'vitest';
import { allSourcesDown, analyticsAvailability } from './availability.js';

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

// Fiação do aviso único com as consultas chegando em tempos diferentes (🟡1 e 🟡2 do qa-redteam da F7).
describe('analyticsAvailability', () => {
  const loading = { isError: false, isSuccess: false };
  const failed = { isError: true, isSuccess: false };
  const ok = { isError: false, isSuccess: true };

  it('tudo carregando: ainda não se sabe, sem erro de bloco', () => {
    expect(analyticsAvailability(false, [loading, loading])).toEqual({ down: false, settling: true });
  });
  it('umas falharam e outras carregam, nenhuma deu certo: ainda decidindo, os erros de bloco esperam', () => {
    expect(analyticsAvailability(false, [failed, loading, failed])).toEqual({ down: false, settling: true });
  });
  it('todas falharam: fora do ar', () => {
    expect(analyticsAvailability(false, [failed, failed])).toEqual({ down: true, settling: false });
  });
  it('fora do ar e tentando de novo (consultas voltam a carregar): o aviso fica', () => {
    expect(analyticsAvailability(true, [loading, failed])).toEqual({ down: true, settling: false });
  });
  it('uma fonte respondeu: acabou a queda, e a falha das outras é parcial', () => {
    expect(analyticsAvailability(true, [ok, failed])).toEqual({ down: false, settling: false });
    expect(analyticsAvailability(false, [ok, loading, failed])).toEqual({ down: false, settling: false });
  });
});
