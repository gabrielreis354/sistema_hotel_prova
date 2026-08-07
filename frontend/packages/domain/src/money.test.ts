import { describe, it, expect } from 'vitest';
import {
  decimalToCents,
  multiplyCents,
  sumCents,
  formatBRL,
  centsToDecimalString,
  MoneyParseError,
} from './money.js';

describe('decimalToCents', () => {
  it('parseia a string DECIMAL do pg sem passar por float', () => {
    expect(decimalToCents('600.00')).toBe(60000);
    expect(decimalToCents('0.10')).toBe(10);
    expect(decimalToCents('12.34')).toBe(1234);
  });

  it('aceita inteiro sem casas e uma casa so', () => {
    expect(decimalToCents('600')).toBe(60000);
    expect(decimalToCents('600.5')).toBe(60050);
  });

  it('trunca alem de 2 casas (centavo e a menor unidade)', () => {
    expect(decimalToCents('1.999')).toBe(199);
  });

  it('lida com negativo', () => {
    expect(decimalToCents('-12.34')).toBe(-1234);
  });

  it('nao sofre o erro de ponto flutuante ao somar fracoes', () => {
    // 0.1 + 0.2 !== 0.3 em float; em centavos e exato.
    expect(sumCents([decimalToCents('0.10'), decimalToCents('0.20')])).toBe(30);
  });

  it('aceita number (agregacoes de analytics) arredondando', () => {
    expect(decimalToCents(300)).toBe(30000);
    expect(decimalToCents(12.5)).toBe(1250);
  });

  it('rejeita lixo', () => {
    expect(() => decimalToCents('abc')).toThrow(MoneyParseError);
    expect(() => decimalToCents('12,34')).toThrow(MoneyParseError);
    expect(() => decimalToCents(Infinity)).toThrow(MoneyParseError);
  });
});

describe('multiplyCents', () => {
  it('multiplica valor unitario por quantidade inteira', () => {
    expect(multiplyCents(1200, 2)).toBe(2400);
  });

  it('multiplica por quantidade fracionaria arredondando ao centavo', () => {
    expect(multiplyCents(1000, 2.5)).toBe(2500);
    expect(multiplyCents(333, 3)).toBe(999);
  });
});

describe('formatBRL', () => {
  // O Intl separa "R$" do numero com um espaco nao-quebravel (U+00A0). Para o teste
  // nao depender do byte do espaco, removemos TODO espaco (/\s/ inclui U+00A0) e
  // comparamos o esqueleto sem espacos.
  it('formata centavos como moeda brasileira', () => {
    expect(formatBRL(60000).replace(/\s/g, '')).toBe('R$600,00');
    expect(formatBRL(10).replace(/\s/g, '')).toBe('R$0,10');
  });
});

describe('centsToDecimalString', () => {
  it('faz o caminho de volta para o formato do backend', () => {
    expect(centsToDecimalString(60000)).toBe('600.00');
    expect(centsToDecimalString(10)).toBe('0.10');
    expect(centsToDecimalString(1234)).toBe('12.34');
  });

  it('e o inverso de decimalToCents', () => {
    for (const v of ['600.00', '0.10', '12.34', '1.05']) {
      expect(centsToDecimalString(decimalToCents(v))).toBe(v);
    }
  });
});
