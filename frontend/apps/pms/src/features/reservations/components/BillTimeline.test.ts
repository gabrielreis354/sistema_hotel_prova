import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BillTimeline } from './BillTimeline.js';
import { buildBillTimeline } from '../reservationLogic.js';

// Ambiente node (vitest.config.ts): renderiza em HTML estático, sem DOM, e lê a coluna Saldo —
// a última célula de cada linha do corpo da tabela. O espaço fino do `formatBRL` (U+00A0) fica.
const text = (html: string) => html.replace(/<[^>]+>/g, '').replace(/[ \t\n]+/g, ' ').trim();

function balanceColumn(html: string): string[] {
  const tbody = html.match(/<tbody>([\s\S]*)<\/tbody>/)?.[1] ?? '';
  return [...tbody.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((row) => {
    const cells = [...(row[1] ?? '').matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)];
    return text(cells.at(-1)?.[1] ?? '');
  });
}

function render(bill: Parameters<typeof buildBillTimeline>[0]) {
  const timeline = buildBillTimeline(bill);
  return { timeline, html: renderToStaticMarkup(createElement(BillTimeline, { timeline, balanceCents: timeline.balanceCents })) };
}

describe('BillTimeline — coluna Saldo (CA-09.d)', () => {
  // Sinal de R$ 1.050,00 pago antes da primeira diária: o saldo de várias linhas fica negativo.
  const advance = {
    status: 'CHECKED_IN',
    check_in_date: '2026-10-22',
    check_out_date: '2026-10-24',
    room_total: 300,
    consumptions: [],
    payments: [{ id: 'p1', amount: 1050, method: 'PIX', kind: 'DEPOSIT', status: 'PAID', paid_at: '2026-10-20T15:00:00.000Z' }],
  };

  it('pagamento antecipado: saldo negativo vira "crédito", sem sinal de menos', () => {
    const { timeline, html } = render(advance);
    expect(timeline.entries.some((e) => e.balanceCents < 0)).toBe(true);
    const column = balanceColumn(html);
    expect(column[0]).toBe('R$ 1.050,00 crédito');
    for (const cell of column) {
      expect(cell).not.toMatch(/[-−]/);
      expect(cell).toMatch(/crédito$/);
    }
  });

  it('saldo positivo e zero não mudam', () => {
    const { html } = render({
      ...advance,
      payments: [{ id: 'p1', amount: 150, method: 'CASH', kind: 'BALANCE', status: 'PAID', paid_at: '2026-10-22T15:00:00.000Z' }],
    });
    // Diária 150 → pagamento 150 (zero) → diária 150.
    expect(balanceColumn(html)).toEqual(['R$ 150,00', 'R$ 0,00', 'R$ 150,00']);
  });

  it('o total continua "A devolver", com o valor sem sinal', () => {
    const { html } = render(advance);
    // <dt>A devolver</dt><dd>R$ 750,00</dd>: sem espaço entre os dois no texto extraído.
    expect(text(html)).toContain('A devolverR$ 750,00');
  });
});
