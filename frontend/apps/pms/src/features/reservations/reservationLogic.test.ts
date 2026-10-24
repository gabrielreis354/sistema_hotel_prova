import { describe, it, expect } from 'vitest';
import {
  buildBillTimeline,
  guestDraftFromTerm,
  maskCpf,
  officialBalanceCents,
  pageCount,
  presetRange,
  quoteStay,
  reservationActions,
  splitLodging,
} from './reservationLogic.js';

const standard = { id: 'r1', number: '101', category: { name: 'Standard', price_per_night: '150.00' } };
const luxo = { id: 'r2', number: '201', category: { name: 'Luxo', price_per_night: '333.33' } };

describe('quoteStay — valor e diárias antes de confirmar', () => {
  it('multiplica a tarifa de cada quarto pelas noites, em centavos', () => {
    const q = quoteStay([standard, luxo], '2026-10-22', '2026-10-25');
    expect(q.ok).toBe(true);
    if (!q.ok) return;
    expect(q.nights).toBe(3);
    expect(q.lines.map((l) => l.subtotalCents)).toEqual([45000, 99999]);
    expect(q.totalCents).toBe(144999);
  });

  it('conta noites como dias de calendário do hotel, inclusive na virada de mês e de ano', () => {
    expect(quoteStay([standard], '2026-10-30', '2026-11-02')).toMatchObject({ ok: true, nights: 3 });
    expect(quoteStay([standard], '2026-12-31', '2027-01-01')).toMatchObject({ ok: true, nights: 1, totalCents: 15000 });
  });

  it('recusa período invertido, data vazia e falta de quarto com o motivo', () => {
    expect(quoteStay([standard], '2026-10-25', '2026-10-22')).toEqual({
      ok: false,
      reason: 'A saída precisa ser depois da entrada.',
    });
    expect(quoteStay([standard], '', '2026-10-22')).toMatchObject({ ok: false });
    expect(quoteStay([], '2026-10-22', '2026-10-23')).toEqual({ ok: false, reason: 'Escolha ao menos um quarto.' });
  });

  it('recusa quarto sem tarifa em vez de somar zero', () => {
    const q = quoteStay([{ id: 'x', number: '9', category: null }], '2026-10-22', '2026-10-23');
    expect(q).toMatchObject({ ok: false });
  });
});

describe('reservationActions — ação desabilitada sempre traz o motivo', () => {
  it('CONFIRMED: check-in e cancelar habilitados; check-out com motivo', () => {
    const a = reservationActions('CONFIRMED');
    expect(a.checkIn).toEqual({ enabled: true });
    expect(a.cancel).toEqual({ enabled: true });
    expect(a.checkOut.enabled).toBe(false);
    expect(a.checkOut.reason).toMatch(/depois do check-in/);
  });

  it('CHECKED_IN: só check-out; cancelar explica que o hóspede está no quarto', () => {
    const a = reservationActions('CHECKED_IN');
    expect(a.checkOut.enabled).toBe(true);
    expect(a.checkIn.enabled).toBe(false);
    expect(a.cancel.reason).toMatch(/Hóspede no quarto/);
  });

  it('estados finais desabilitam tudo, cada um com motivo', () => {
    for (const status of ['CHECKED_OUT', 'CANCELLED']) {
      const a = reservationActions(status);
      for (const s of [a.checkIn, a.checkOut, a.cancel]) {
        expect(s.enabled).toBe(false);
        expect(s.reason?.length).toBeGreaterThan(0);
      }
    }
  });

  it('PENDING habilita check-in direto (walk-in, decisão de 24/10/2026) e cancelar', () => {
    const a = reservationActions('PENDING');
    expect(a.checkIn).toEqual({ enabled: true });
    expect(a.cancel).toEqual({ enabled: true });
    expect(a.checkOut).toEqual({ enabled: false, reason: 'Check-out só depois do check-in.' });
  });

  it('status desconhecido é fail-safe: tudo desabilitado', () => {
    const a = reservationActions('NO_SHOW');
    expect([a.checkIn.enabled, a.checkOut.enabled, a.cancel.enabled]).toEqual([false, false, false]);
    expect(reservationActions(undefined).checkIn.reason).toMatch(/desconhecida/);
  });
});

describe('splitLodging', () => {
  it('distribui o resto em centavos pelas primeiras noites e soma o total', () => {
    expect(splitLodging(100000, 3)).toEqual([33334, 33333, 33333]);
    expect(splitLodging(45000, 3)).toEqual([15000, 15000, 15000]);
    expect(splitLodging(45000, 0)).toEqual([]);
  });
});

describe('buildBillTimeline — conta em linha do tempo', () => {
  const bill = {
    status: 'CHECKED_IN',
    check_in_date: '2026-10-22',
    check_out_date: '2026-10-24',
    room_total: 300,
    balance_due: 235.5,
    consumptions: [{ id: 'c1', description: 'Água', amount: 5.5, consumed_at: '2026-10-22T18:30:00.000Z' }],
    payments: [
      { id: 'p1', amount: 70, method: 'CASH', kind: 'DEPOSIT', status: 'PAID', paid_at: '2026-10-22T15:00:00.000Z' },
      { id: 'p2', amount: 50, method: 'PIX', kind: 'BALANCE', status: 'PENDING', paid_at: null },
    ],
  };

  it('ordena diárias, consumos e pagamentos no tempo, com saldo correndo', () => {
    const t = buildBillTimeline(bill);
    expect(t.entries.map((e) => e.key)).toEqual([
      'lodging-2026-10-22',
      'payment-p1',
      'consumption-c1',
      'lodging-2026-10-23',
      'payment-p2',
    ]);
    expect(t.entries.map((e) => e.balanceCents)).toEqual([15000, 8000, 8550, 23550, 23550]);
  });

  it('pagamento não confirmado aparece, mas não abate o saldo', () => {
    const t = buildBillTimeline(bill);
    const pix = t.entries.find((e) => e.key === 'payment-p2');
    expect(pix?.notCounted).toBe(true);
    expect(pix?.label).toMatch(/aguardando confirmação/);
    expect(t.pendingCents).toBe(5000);
    expect(t.paidCents).toBe(7000);
    expect(t.chargesCents).toBe(30550);
  });

  it('PIX expirado ou falho aparece, não abate e NÃO soma em "aguardando" (igual ao total_pending)', () => {
    const t = buildBillTimeline({
      ...bill,
      payments: [
        { id: 'e1', amount: 100, method: 'PIX', kind: 'DEPOSIT', status: 'EXPIRED', paid_at: null },
        { id: 'f1', amount: 40, method: 'PIX', kind: 'BALANCE', status: 'FAILED', paid_at: null },
        { id: 'k1', amount: 100, method: 'CASH', kind: 'FULL', status: 'PAID', paid_at: '2026-10-22T15:00:00.000Z' },
      ],
    });
    expect(t.pendingCents).toBe(0);
    expect(t.paidCents).toBe(10000);
    const expired = t.entries.find((e) => e.key === 'payment-e1');
    expect(expired).toMatchObject({ notCounted: true, awaiting: false });
    expect(expired?.label).toMatch(/expirado/);
    expect(t.entries.find((e) => e.key === 'payment-f1')?.label).toMatch(/falhou/);
    expect(t.balanceCents).toBe(30550 - 10000);
  });

  it('o saldo da linha do tempo bate com o balance_due do servidor', () => {
    expect(buildBillTimeline(bill).balanceCents).toBe(officialBalanceCents(bill));
  });

  it('reserva cancelada (room_total 0) não gera diária', () => {
    const t = buildBillTimeline({ ...bill, room_total: 0, consumptions: [], payments: [] });
    expect(t.entries).toEqual([]);
    expect(t.balanceCents).toBe(0);
  });
});

describe('filtro de período e paginação', () => {
  it('presets partem de hoje', () => {
    expect(presetRange('today', '2026-10-21')).toEqual({ from: '2026-10-21', to: '2026-10-21' });
    expect(presetRange('next7', '2026-10-28')).toEqual({ from: '2026-10-28', to: '2026-11-04' });
  });

  it('pageCount nunca devolve zero', () => {
    expect(pageCount(0, 20)).toBe(1);
    expect(pageCount(41, 20)).toBe(3);
  });
});

describe('maskCpf — comprovante não imprime o CPF inteiro', () => {
  it('mostra só os seis dígitos do meio, com ou sem máscara de entrada', () => {
    expect(maskCpf('123.456.789-00')).toBe('***.456.789-**');
    expect(maskCpf('12345678900')).toBe('***.456.789-**');
  });

  it('omite o que não é CPF de 11 dígitos', () => {
    expect(maskCpf('1234')).toBeNull();
    expect(maskCpf('')).toBeNull();
    expect(maskCpf(null)).toBeNull();
    expect(maskCpf(undefined)).toBeNull();
  });
});

describe('guestDraftFromTerm — o que foi digitado na busca vira o campo do cadastro', () => {
  it('reconhece e-mail, CPF, telefone e nome', () => {
    expect(guestDraftFromTerm('ana@x.com').email).toBe('ana@x.com');
    expect(guestDraftFromTerm('123.456.789-00').cpf).toBe('123.456.789-00');
    expect(guestDraftFromTerm('12345678900').cpf).toBe('12345678900');
    expect(guestDraftFromTerm('(11) 98888-7777').phone).toBe('(11) 98888-7777');
    expect(guestDraftFromTerm('Maria Souza').full_name).toBe('Maria Souza');
    expect(guestDraftFromTerm('  ')).toEqual({ full_name: '', cpf: '', phone: '', email: '' });
  });
});
