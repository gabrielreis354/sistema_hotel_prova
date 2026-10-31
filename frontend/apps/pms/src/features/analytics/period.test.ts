import { describe, it, expect } from 'vitest';
import { defaultPeriod, periodError, monthLabel } from './period.js';

describe('defaultPeriod', () => {
  it('vai do dia 1º do mês até hoje', () => {
    expect(defaultPeriod('2026-10-30')).toEqual({ start: '2026-10-01', end: '2026-10-30' });
  });

  it('no dia 1º, o período é só o próprio dia', () => {
    expect(defaultPeriod('2026-11-01')).toEqual({ start: '2026-11-01', end: '2026-11-01' });
  });
});

describe('periodError', () => {
  it('aceita um dia só e um ano exato', () => {
    expect(periodError({ start: '2026-10-30', end: '2026-10-30' })).toBeNull();
    expect(periodError({ start: '2025-10-31', end: '2026-10-30' })).toBeNull();
  });

  it('recusa data vazia ou fora do formato', () => {
    expect(periodError({ start: '', end: '2026-10-30' })).toBe('Informe a data inicial e a final.');
    expect(periodError({ start: '30/10/2026', end: '2026-10-30' })).toBe('Informe a data inicial e a final.');
  });

  it('recusa início depois do fim', () => {
    expect(periodError({ start: '2026-10-31', end: '2026-10-30' })).toBe('A data inicial não pode ser depois da final.');
  });

  it('recusa mais de um ano', () => {
    expect(periodError({ start: '2025-01-01', end: '2026-10-30' })).toBe('Consulte no máximo um ano por vez.');
  });
});

describe('monthLabel', () => {
  it('formata o mês do backend sem passar por Date', () => {
    expect(monthLabel('2026-10')).toBe('out/26');
    expect(monthLabel('2027-01')).toBe('jan/27');
  });

  it('devolve o texto original se não reconhecer', () => {
    expect(monthLabel('2026-13')).toBe('2026-13');
  });
});
