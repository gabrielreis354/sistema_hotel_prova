import { describe, expect, it } from 'vitest';
import {
  arrivalRows,
  checkInBlockedReason,
  departureRows,
  formatPercent,
  inHouseRows,
  soldToday,
  toTodayAlerts,
  type TodayReservation,
} from './todayLogic.js';

const TODAY = '2026-11-04';

function res(id: string, status: string, checkIn: string, checkOut: string, room = '101', guest = 'Ana'): TodayReservation {
  return { id, status, check_in_date: checkIn, check_out_date: checkOut, room: { number: room }, guest: { full_name: guest } };
}

describe('checkInBlockedReason', () => {
  it('quarto livre não bloqueia', () => {
    expect(checkInBlockedReason({ number: '12', status: 'AVAILABLE' })).toBeNull();
  });

  it.each([
    ['OCCUPIED', 'Quarto 12 ainda ocupado'],
    ['CLEANING', 'Quarto 12 em limpeza'],
    ['MAINTENANCE', 'Quarto 12 em manutenção'],
    ['OUTRO', 'Quarto 12 indisponível'],
  ])('quarto em %s bloqueia com o motivo', (status, reason) => {
    expect(checkInBlockedReason({ number: '12', status })).toBe(reason);
  });

  it('sem o status do quarto a decisão fica com o servidor', () => {
    expect(checkInBlockedReason({ number: '12' })).toBeNull();
    expect(checkInBlockedReason(null)).toBeNull();
  });
});

describe('arrivalRows', () => {
  const upcoming = [
    res('a', 'CONFIRMED', TODAY, '2026-11-06', '10'),
    res('b', 'PENDING', TODAY, '2026-11-05', '2'),
    res('late', 'CONFIRMED', '2026-11-02', '2026-11-07', '1'),
    res('noshow', 'CONFIRMED', TODAY, '2026-11-05', '30'),
    res('future', 'CONFIRMED', '2026-11-05', '2026-11-06', '3'),
    res('in', 'CHECKED_IN', TODAY, '2026-11-05', '4'),
  ];

  it('só PENDING/CONFIRMED com entrada hoje ou antes, no-show no topo, depois atrasada, depois por quarto (natural)', () => {
    const rows = arrivalRows(upcoming, TODAY, new Set(['noshow']));
    expect(rows.map((r) => r.reservation.id)).toEqual(['noshow', 'late', 'b', 'a']);
    expect(rows.find((r) => r.reservation.id === 'late')?.late).toBe(true);
    expect(rows.find((r) => r.reservation.id === 'noshow')?.noShowRisk).toBe(true);
    expect(rows.find((r) => r.reservation.id === 'a')?.noShowRisk).toBe(false);
  });

  it('alerta de no-show de reserva que já não é chegada não marca nada', () => {
    const rows = arrivalRows(upcoming, TODAY, new Set(['in', 'gone']));
    expect(rows.some((r) => r.noShowRisk)).toBe(false);
  });

  it('lista vazia vira lista vazia', () => {
    expect(arrivalRows([], TODAY, new Set())).toEqual([]);
  });
});

describe('departureRows e inHouseRows', () => {
  const inHouse = [
    res('stay', 'CHECKED_IN', '2026-11-01', '2026-11-08', '5'),
    res('today', 'CHECKED_IN', '2026-11-01', TODAY, '12'),
    res('overdue', 'CHECKED_IN', '2026-10-30', '2026-11-03', '20'),
    res('stale', 'CHECKED_OUT', '2026-10-30', TODAY, '7'),
  ];

  it('saída hoje ou vencida, atrasada primeiro (D-9)', () => {
    const rows = departureRows(inHouse, TODAY);
    expect(rows.map((r) => [r.reservation.id, r.late])).toEqual([
      ['overdue', true],
      ['today', false],
    ]);
  });

  it('na casa = todo CHECKED_IN, por quarto', () => {
    expect(inHouseRows(inHouse).map((r) => r.id)).toEqual(['stay', 'today', 'overdue']);
  });
});

describe('soldToday (D-6)', () => {
  it('ocupados + chegadas de hoje ainda não feitas; atrasada não conta', () => {
    const rows = arrivalRows(
      [res('a', 'CONFIRMED', TODAY, '2026-11-05'), res('late', 'PENDING', '2026-11-01', '2026-11-05')],
      TODAY,
      new Set(),
    );
    expect(soldToday(3, rows)).toBe(4);
    expect(soldToday(0, [])).toBe(0);
  });
});

describe('toTodayAlerts — só campos estáveis entre o core e a H.3', () => {
  it('extrai ids de no-show, quartos em limpeza e a contagem de pendentes', () => {
    const alerts = toTodayAlerts({
      no_show_risk: [{ reservation_id: 'r1' }, {}],
      cleaning_pending: [{ room_id: 'q1', room_number: '204', category: 'Standard', cleaning_since: '2026-11-04T13:00:00Z' }, { room_number: 'sem id' }],
      pending_too_long: [{ reservation_id: 'p1' }, { reservation_id: 'p2' }],
    });
    expect([...alerts.noShowIds]).toEqual(['r1']);
    expect(alerts.cleaning).toEqual([{ id: 'q1', number: '204', category: 'Standard', since: '2026-11-04T13:00:00Z' }]);
    expect(alerts.pendingTooLong).toBe(2);
  });

  it('resposta vazia não quebra', () => {
    const alerts = toTodayAlerts({});
    expect(alerts.noShowIds.size).toBe(0);
    expect(alerts.cleaning).toEqual([]);
    expect(alerts.pendingTooLong).toBe(0);
  });

  it('o contrato da H.3 (amount string, guest_id, sem telefone) é aceito igual', () => {
    const h3 = { no_show_risk: [{ reservation_id: 'r9', guest_id: 'g', amount: '450.00' }] };
    expect([...toTodayAlerts(h3).noShowIds]).toEqual(['r9']);
  });
});

describe('formatPercent', () => {
  it('formata em pt-BR', () => {
    expect(formatPercent(72.5)).toBe('72,5%');
    expect(formatPercent(100)).toBe('100%');
    expect(formatPercent(0)).toBe('0%');
  });
});
