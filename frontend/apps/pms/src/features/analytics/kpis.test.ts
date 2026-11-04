import { describe, it, expect } from 'vitest';
import { buildKpis, NO_VALUE } from './kpis.js';

const occupancy = {
  date: '2026-10-30',
  total_rooms: 20,
  occupied: 13,
  available: 5,
  cleaning: 2,
  occupancy_rate: 65,
  adr: 312.5,
  revpar: 203.13,
};

// O Intl separa "R$" do valor com espaço não separável.
const brl = (s: string) => s.replace(/ /g, ' ');

describe('buildKpis', () => {
  it('monta os 4 números do dia, na ordem do RT-48', () => {
    const kpis = buildKpis(occupancy, 1250.4);
    expect(kpis.map((k) => k.id)).toEqual(['occupancy', 'adr', 'revpar', 'revenue']);
    expect(kpis[0]).toMatchObject({ value: '65,0%', hint: '13 de 20 quartos ocupados agora' });
    expect(brl(kpis[1]!.value)).toBe('R$ 312,50');
    expect(brl(kpis[2]!.value)).toBe('R$ 203,13');
    expect(brl(kpis[3]!.value)).toBe('R$ 1.250,40');
  });

  it('o float do SQL é arredondado para centavo, sem resto de ponto flutuante', () => {
    const [, adr] = buildKpis({ ...occupancy, adr: 0.1 + 0.2 }, 0);
    expect(brl(adr!.value)).toBe('R$ 0,30');
  });

  it('receita zero é zero, não traço', () => {
    expect(brl(buildKpis(occupancy, 0)[3]!.value)).toBe('R$ 0,00');
  });

  it('cada fonte falta sozinha: sem ocupação, a receita continua', () => {
    const kpis = buildKpis(undefined, 80);
    expect(kpis.slice(0, 3).map((k) => k.value)).toEqual([NO_VALUE, NO_VALUE, NO_VALUE]);
    expect(kpis[0]!.hint).toBe('Quartos ocupados agora');
    expect(brl(kpis[3]!.value)).toBe('R$ 80,00');
  });

  it('sem receita, a ocupação continua', () => {
    const kpis = buildKpis(occupancy, undefined);
    expect(kpis[0]!.value).toBe('65,0%');
    expect(kpis[3]!.value).toBe(NO_VALUE);
  });
});
