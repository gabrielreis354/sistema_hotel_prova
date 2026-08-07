import { describe, it, expect } from 'vitest';
import {
  HOTEL_TZ,
  parseHotelDate,
  formatDateBR,
  toISODate,
  nightsBetween,
  addDaysISO,
} from './dates.js';

describe('fuso fixo', () => {
  it('usa America/Sao_Paulo', () => {
    expect(HOTEL_TZ).toBe('America/Sao_Paulo');
  });
});

describe('formatDateBR', () => {
  it('nao escorrega um dia ao formatar data de calendario', () => {
    // O bug que estamos evitando: "2026-07-01" nunca pode virar "30/06".
    expect(formatDateBR('2026-07-01')).toBe('01/07/2026');
    expect(formatDateBR('2026-01-01')).toBe('01/01/2026');
    expect(formatDateBR('2026-12-31')).toBe('31/12/2026');
  });

  it('ida e volta parseHotelDate -> toISODate preserva a data', () => {
    expect(toISODate(parseHotelDate('2026-07-01'))).toBe('2026-07-01');
    expect(toISODate(parseHotelDate('2026-02-28'))).toBe('2026-02-28');
  });
});

describe('nightsBetween', () => {
  it('conta as noites entre check-in e check-out', () => {
    expect(nightsBetween('2026-07-01', '2026-07-05')).toBe(4);
    expect(nightsBetween('2026-07-01', '2026-07-02')).toBe(1);
  });

  it('mesmo dia = 0 noites', () => {
    expect(nightsBetween('2026-07-01', '2026-07-01')).toBe(0);
  });

  it('atravessa virada de mes corretamente', () => {
    expect(nightsBetween('2026-01-30', '2026-02-02')).toBe(3);
  });
});

describe('addDaysISO', () => {
  it('soma dias mantendo o formato do backend', () => {
    expect(addDaysISO('2026-07-01', 4)).toBe('2026-07-05');
    expect(addDaysISO('2026-01-30', 3)).toBe('2026-02-02');
  });
});

describe('validacao', () => {
  it('rejeita formato invalido', () => {
    expect(() => parseHotelDate('01/07/2026')).toThrow(RangeError);
    expect(() => parseHotelDate('2026-7-1')).toThrow(RangeError);
  });
});
