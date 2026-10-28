import { describe, it, expect } from 'vitest';
import { billableCents, closedNotice, footerTotals, itemLine, undoLabel } from './accountTotals.js';
import { addTap, markSending, applyOutcome } from './queueCore.js';

const item = (total: string, billable = true, quantity = 1, reason: string | null = null) => ({
  total, unit_price: total, quantity, billable, reason, description: 'x',
});

describe('billableCents — cortesia soma zero (CA-05.5.h)', () => {
  it('soma só os itens faturáveis, em centavos exatos', () => {
    expect(billableCents([item('12.10'), item('0.20'), item('30.00', false, 1, 'COURTESY')])).toBe(1230);
  });

  it('bate com o total que o servidor calcula para a mesma lista', () => {
    const items = [item('45.90'), item('8.00', false, 1, 'COURTESY'), item('25.00', true, 2)];
    expect(billableCents(items)).toBe(7090); // servidor: "70.90"
  });
});

describe('itemLine — como o item aparece', () => {
  it('cortesia: preço riscado, rótulo e zero no total', () => {
    expect(itemLine(item('30.00', false, 1, 'COURTESY'))).toMatchObject({
      struck: true, label: 'Cortesia', countedCents: 0, priceCents: 3000,
    });
  });

  it('quantidade só aparece se diferente de 1 (CA-05.5.c)', () => {
    expect(itemLine(item('12.00')).quantityLabel).toBeNull();
    expect(itemLine(item('24.00', true, 2)).quantityLabel).toBe('2×');
  });

  it('outros motivos de não faturável têm rótulo próprio', () => {
    expect(itemLine(item('20.00', false, 1, 'STAFF')).label).toBe('Funcionário');
    expect(itemLine(item('20.00', false, 1, 'LOSS')).label).toBe('Perda');
    expect(itemLine(item('20.00', false, 1, 'INTERNAL_USE')).label).toBe('Uso interno');
  });
});

describe('footerTotals — rodapé honesto sobre a fila (CA-05.5.d, f)', () => {
  const T0 = 1_700_000_000_000;

  it('total = servidor + o que ainda está na fila, com a parte da fila separada', () => {
    let q = addTap([], { ownerId: 'g', accountId: 'm', productId: 'p', description: 'x', unitPrice: '12.00' }, T0, 'a');
    q = addTap(q, { ownerId: 'g', accountId: 'm', productId: 'p', description: 'x', unitPrice: '12.00' }, T0, 'b');
    q = addTap(q, { ownerId: 'g', accountId: 'm', productId: 'q', description: 'y', unitPrice: '5.50' }, T0, 'c');
    expect(footerTotals('70.90', q, 'm')).toEqual({ serverCents: 7090, pendingCents: 2950, totalCents: 10040 });
  });

  it('recusado não entra no total; sem fila, pendente é zero', () => {
    let q = addTap([], { ownerId: 'g', accountId: 'm', productId: 'p', description: 'x', unitPrice: '12.00' }, T0, 'a');
    q = applyOutcome(markSending(q, 'a', T0), 'a', { kind: 'rejected', reason: 'x' }, T0);
    expect(footerTotals('10.00', q, 'm')).toEqual({ serverCents: 1000, pendingCents: 0, totalCents: 1000 });
  });
});

describe('undoLabel — "Desfazer" diz quanto tira (P1)', () => {
  it('linha com 1: "Desfazer"', () => {
    expect(undoLabel(1)).toBe('Desfazer');
  });

  it('linha com mais de 1: "Desfazer 1", porque tira só um', () => {
    expect(undoLabel(2)).toBe('Desfazer 1');
  });
});

describe('closedNotice — o que a recepção cobra depois de fechar (🟡-1 do qa-redteam)', () => {
  it('saldo a receber: o valor que falta, não o total', () => {
    expect(closedNotice('Day-use João', { total: '300.00', payments_made: '200.00', balance: '100.00' })).toBe(
      'Day-use João fechada. Saldo a receber: R$\u00a0100,00.',
    );
  });

  it('saldo negativo é crédito do hóspede, sem sinal de menos', () => {
    expect(closedNotice('Mesa 3', { balance: '-15.50' })).toBe('Mesa 3 fechada. Crédito do hóspede: R$\u00a015,50.');
  });

  it('saldo zero: nada a receber', () => {
    expect(closedNotice('Mesa 3', { balance: '0.00' })).toBe('Mesa 3 fechada. Nada a receber.');
  });

  it('sem bill na resposta: só diz que fechou', () => {
    expect(closedNotice('Mesa 3', undefined)).toBe('Mesa 3 fechada.');
  });

  it('bill sem saldo (resposta incompleta): não inventa valor', () => {
    expect(closedNotice('Mesa 3', { total: '50.00' })).toBe('Mesa 3 fechada.');
  });
});
