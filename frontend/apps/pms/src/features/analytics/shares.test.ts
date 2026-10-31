import { describe, it, expect } from 'vitest';
import { methodLabel, toShares, scaleToMax } from './shares.js';

const brl = (s: string) => s.replace(/ /g, ' ');

describe('methodLabel', () => {
  it('traduz os meios do backend', () => {
    expect(methodLabel('CARTAO_CREDITO')).toBe('Cartão de crédito');
    expect(methodLabel('PIX')).toBe('PIX');
  });

  it('meio desconhecido aparece com o código; ausente tem rótulo próprio', () => {
    expect(methodLabel('BOLETO')).toBe('BOLETO');
    expect(methodLabel(undefined)).toBe('Sem meio informado');
  });
});

describe('toShares', () => {
  it('calcula a participação em centavos e formata o valor', () => {
    const rows = toShares([
      { key: 'PIX', label: 'PIX', count: 3, value: 750 },
      { key: 'DINHEIRO', label: 'Dinheiro', count: 1, value: 250 },
    ]);
    expect(rows.map((r) => r.share)).toEqual([0.75, 0.25]);
    expect(rows.map((r) => r.percent)).toEqual(['75,0%', '25,0%']);
    expect(brl(rows[0]!.amount)).toBe('R$ 750,00');
  });

  it('float do SQL não deixa a soma das partes diferente de 100%', () => {
    const rows = toShares([
      { key: 'a', label: 'a', count: 1, value: 0.1 },
      { key: 'b', label: 'b', count: 1, value: 0.2 },
    ]);
    expect(rows[0]!.share + rows[1]!.share).toBe(1);
  });

  it('total zero não divide por zero', () => {
    const rows = toShares([{ key: 'a', label: 'a', count: 0, value: 0 }]);
    expect(rows[0]).toMatchObject({ share: 0, percent: '0,0%' });
  });

  it('lista vazia devolve vazio', () => {
    expect(toShares([])).toEqual([]);
  });
});

describe('scaleToMax', () => {
  it('o maior valor ocupa 100%', () => {
    expect(scaleToMax([50, 100, 25])).toEqual([50, 100, 25]);
  });

  it('tudo zero, vazio ou negativo dá zero', () => {
    expect(scaleToMax([0, 0])).toEqual([0, 0]);
    expect(scaleToMax([])).toEqual([]);
    expect(scaleToMax([-5, 10])).toEqual([0, 100]);
  });
});
