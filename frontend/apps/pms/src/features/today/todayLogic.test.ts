import { describe, expect, it } from 'vitest';
import {
  visibleRows,
  arrivalFlags,
  arrivalRows,
  checkInBlockedReason,
  departureRows,
  formatPercent,
  inHouseRows,
  soldToday,
  toTodayAlerts,
  toggleFocusTarget,
  type TodayReservation,
  departuresError,
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

  it('a contagem de pendentes vem do total, porque a lista tem teto', () => {
    const alerts = toTodayAlerts({
      pending_too_long: [{ reservation_id: 'p1' }],
      totals: { pending_too_long: 73 },
    });
    expect(alerts.pendingTooLong).toBe(73);
  });

  it('quarto sem categoria projetada não quebra', () => {
    const alerts = toTodayAlerts({ cleaning_pending: [{ room_id: 'q1', room_number: '204', category: null }] });
    expect(alerts.cleaning[0]?.category).toBe('');
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

describe('visibleRows — corte de 8 por bloco (SPEC-08, T-08.4)', () => {
  const rows = Array.from({ length: 30 }, (_, i) => i);

  it('mostra os 8 primeiros e conta o resto', () => {
    expect(visibleRows(rows, false)).toEqual({ shown: rows.slice(0, 8), hidden: 22 });
  });

  it('expandido mostra tudo', () => {
    expect(visibleRows(rows, true)).toEqual({ shown: rows, hidden: 0 });
  });

  it('até 8 itens não corta nada', () => {
    expect(visibleRows(rows.slice(0, 8), false)).toEqual({ shown: rows.slice(0, 8), hidden: 0 });
    expect(visibleRows([], false)).toEqual({ shown: [], hidden: 0 });
  });
});

describe('arrivalFlags — selos curtos da chegada (ressalva 🟡1 da T-08.4, decisão de 16/11)', () => {
  const chegada = (late: boolean, noShowRisk: boolean, checkIn = '2026-11-03') => ({
    reservation: res('r1', 'CONFIRMED', checkIn, '2026-11-06'),
    late,
    noShowRisk,
  });

  it('chegada sem alerta não tem selo', () => {
    expect(arrivalFlags(chegada(false, false))).toEqual([]);
  });

  it('sem pagamento: rótulo curto na tela, risco de no-show no texto completo', () => {
    expect(arrivalFlags(chegada(false, true))).toEqual([
      { tone: 'maintenance', label: 'Sem pagamento', full: 'Sem pagamento · risco de no-show' },
    ]);
  });

  it('atrasada: dia e mês na tela, a data inteira no texto completo', () => {
    expect(arrivalFlags(chegada(true, false))).toEqual([
      { tone: 'cleaning', label: 'Atrasada · 03/11', full: 'Chegada atrasada · entrada era 03/11/2026' },
    ]);
  });

  it('os dois alertas: sem pagamento primeiro', () => {
    expect(arrivalFlags(chegada(true, true)).map((f) => f.label)).toEqual(['Sem pagamento', 'Atrasada · 03/11']);
  });

  it('atrasada sem data de entrada não inventa selo', () => {
    expect(arrivalFlags({ reservation: { id: 'r2', status: 'CONFIRMED' }, late: true, noShowRisk: false })).toEqual([]);
  });

  // Medido em 375 px (16/11): até 16 caracteres o selo cabe ao lado de "Quarto 101 · 3 diárias" e a
  // chegada perde uma linha inteira. Com 17 ("Atrasada · desde 15/11" tinha 22) ele já quebrava.
  it('nenhum rótulo curto passa de 16 caracteres', () => {
    for (const f of arrivalFlags(chegada(true, true, '2026-12-31'))) expect(f.label.length).toBeLessThanOrEqual(16);
  });
});

describe('toggleFocusTarget — foco do "Ver todas" e do "Mostrar menos" (ressalva 🟡2 da T-08.4)', () => {
  it('ao expandir, o foco vai para o primeiro item que apareceu (o 9º)', () => {
    expect(toggleFocusTarget(true, 30)).toEqual({ kind: 'item', index: 8 });
  });

  it('ao recolher, o foco fica no botão, que precisa voltar para a vista', () => {
    expect(toggleFocusTarget(false, 30)).toEqual({ kind: 'button' });
  });

  it('com o corte informado, o primeiro item novo é o do corte', () => {
    expect(toggleFocusTarget(true, 12, 5)).toEqual({ kind: 'item', index: 5 });
  });

  it('sem item novo para mostrar, o foco fica no botão', () => {
    expect(toggleFocusTarget(true, 8)).toEqual({ kind: 'button' });
  });
});

describe('departuresError — o bloco Saídas fala das saídas (QA 24/11, 🟢-6)', () => {
  it('troca o nome do bloco vizinho; outro erro e nulo passam iguais', () => {
    const inHouse = new Error('Não foi possível carregar os hóspedes na casa. Confira a conexão e tente de novo.');
    expect(departuresError(inHouse)?.message).toBe('Não foi possível carregar as saídas. Confira a conexão e tente de novo.');
    const other = new Error('Sessão expirada.');
    expect(departuresError(other)).toBe(other);
    expect(departuresError(null)).toBeNull();
  });
});
