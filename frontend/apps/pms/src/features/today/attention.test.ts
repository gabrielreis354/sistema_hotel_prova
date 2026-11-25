import { describe, expect, it } from 'vitest';
import { attentionItems } from './attention.js';

describe('Atenção por gravidade (SPEC-10 F3, protótipo de 22/11)', () => {
  const todos = attentionItems({ noShow: 1, maintenance: 2, lateDepartures: 3, cleaning: 1, pendingTooLong: 4 });

  it('ordem: dinheiro e bloqueio (vermelho) antes do atraso e da limpeza (âmbar) e das pendentes (azul)', () => {
    expect(todos.map((a) => a.id)).toEqual(['no-show', 'maintenance', 'late-departures', 'cleaning', 'pending']);
    expect(todos.map((a) => a.tone)).toEqual(['maintenance', 'maintenance', 'cleaning', 'cleaning', 'booked']);
  });

  it('texto longo e curto, no singular e no plural', () => {
    expect(todos[0]).toMatchObject({ count: 1, long: 'chegada sem pagamento — risco de no-show', short: 'sem pagamento' });
    expect(todos[1]).toMatchObject({ long: 'quartos em manutenção', short: 'em manutenção' });
    expect(todos[2]).toMatchObject({ long: 'saídas atrasadas', short: 'saídas atrasadas' });
    expect(todos[4]).toMatchObject({ long: 'reservas pendentes há mais de 48 h', short: 'pendentes +48 h' });
  });

  it('cada item leva ao lugar da ação', () => {
    expect(Object.fromEntries(todos.map((a) => [a.id, a.href ?? a.to]))).toEqual({
      'no-show': '#chegadas-titulo',
      maintenance: '#fita',
      'late-departures': '#saidas-titulo',
      cleaning: '#limpeza-titulo',
      pending: '/reservas',
    });
  });

  it('tipo sem ocorrência não aparece', () => {
    expect(attentionItems({ noShow: 0, maintenance: 0, lateDepartures: 1, cleaning: 0, pendingTooLong: 0 }).map((a) => a.id)).toEqual(['late-departures']);
  });
});
