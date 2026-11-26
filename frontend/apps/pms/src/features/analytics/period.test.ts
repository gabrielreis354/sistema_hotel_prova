import { describe, it, expect } from 'vitest';
import { appliedPeriod, defaultPeriod, fillMonths, fillSeasonality, noSeasonReservations, periodError, monthLabel, monthlyWindow } from './period.js';

describe('defaultPeriod', () => {
  it('vai do dia 1º do mês até hoje', () => {
    expect(defaultPeriod('2026-10-30')).toEqual({ start: '2026-10-01', end: '2026-10-30' });
  });

  it('no dia 1º, o período é só o próprio dia', () => {
    expect(defaultPeriod('2026-11-01')).toEqual({ start: '2026-11-01', end: '2026-11-01' });
  });
});

describe('periodError', () => {
  it('aceita um dia só e um ano exato', () => {
    expect(periodError({ start: '2026-10-30', end: '2026-10-30' })).toBeNull();
    expect(periodError({ start: '2025-10-31', end: '2026-10-30' })).toBeNull();
  });

  it('recusa data vazia ou fora do formato', () => {
    expect(periodError({ start: '', end: '2026-10-30' })).toBe('Informe a data inicial e a final.');
    expect(periodError({ start: '30/10/2026', end: '2026-10-30' })).toBe('Informe a data inicial e a final.');
  });

  it('recusa início depois do fim', () => {
    expect(periodError({ start: '2026-10-31', end: '2026-10-30' })).toBe('A data inicial não pode ser depois da final.');
  });

  it('recusa mais de um ano', () => {
    expect(periodError({ start: '2025-01-01', end: '2026-10-30' })).toBe('Consulte no máximo um ano por vez.');
  });
});

describe('monthLabel', () => {
  it('formata o mês do backend sem passar por Date', () => {
    expect(monthLabel('2026-10')).toBe('out/26');
    expect(monthLabel('2027-01')).toBe('jan/27');
  });

  it('devolve o texto original se não reconhecer', () => {
    expect(monthLabel('2026-13')).toBe('2026-13');
  });
});

describe('monthlyWindow', () => {
  it('12 meses terminam no mês corrente', () => {
    expect(monthlyWindow('2026-10-30', 12)).toEqual({ start: '2025-11-01', end: '2026-10-30' });
  });

  it('atravessa a virada do ano e aceita 1 mês', () => {
    expect(monthlyWindow('2026-01-15', 6)).toEqual({ start: '2025-08-01', end: '2026-01-15' });
    expect(monthlyWindow('2026-01-15', 1)).toEqual({ start: '2026-01-01', end: '2026-01-15' });
  });

  it('24 meses', () => {
    expect(monthlyWindow('2026-10-30', 24)).toEqual({ start: '2024-11-01', end: '2026-10-30' });
  });
});

describe('fillMonths', () => {
  const window = { start: '2026-01-01', end: '2026-04-15' };

  it('devolve todos os meses da janela, com zero onde o backend não trouxe linha', () => {
    expect(fillMonths(window, [
      { month: '2026-01', total: 1500 },
      { month: '2026-03', total: 900 },
    ])).toEqual([
      { month: '2026-01', total: 1500 },
      { month: '2026-02', total: 0 },
      { month: '2026-03', total: 900 },
      { month: '2026-04', total: 0 },
    ]);
  });

  it('atravessa a virada do ano', () => {
    expect(fillMonths({ start: '2025-11-01', end: '2026-01-31' }, []).map((m) => m.month))
      .toEqual(['2025-11', '2025-12', '2026-01']);
  });

  it('ignora linha fora da janela', () => {
    expect(fillMonths({ start: '2026-01-01', end: '2026-01-31' }, [{ month: '2025-12', total: 10 }]))
      .toEqual([{ month: '2026-01', total: 0 }]);
  });
});

describe('fillSeasonality', () => {
  // Mesma janela do backend (GetSeasonalityController): começa no mês de `hoje − months meses` e
  // não tem fim — reservas futuras entram. Sem o preenchimento, mar/26 e jun/26 viravam barras
  // vizinhas (achado 3 da revisão de 15/11).
  const row = (month: string, reservations: number, avg_nights: number) => ({ month, reservations, revenue: '0.00', avg_nights });

  it('começa no mês de hoje − months, como o backend (13 meses com 12)', () => {
    const months = fillSeasonality('2026-11-16', 12, []).map((m) => m.month);
    expect(months[0]).toBe('2025-11');
    expect(months.at(-1)).toBe('2026-11');
    expect(months).toHaveLength(13);
  });

  it('preenche o buraco do meio com zero e sem noites médias', () => {
    expect(fillSeasonality('2026-06-10', 3, [row('2026-03', 4, 2.5), row('2026-06', 2, 1)])).toEqual([
      { month: '2026-03', reservations: 4, avg_nights: 2.5 },
      { month: '2026-04', reservations: 0, avg_nights: null },
      { month: '2026-05', reservations: 0, avg_nights: null },
      { month: '2026-06', reservations: 2, avg_nights: 1 },
    ]);
  });

  it('vai até o último mês futuro que o backend trouxe, preenchendo o caminho', () => {
    expect(fillSeasonality('2026-11-16', 1, [row('2027-02', 1, 3)]).map((m) => [m.month, m.reservations])).toEqual([
      ['2026-10', 0], ['2026-11', 0], ['2026-12', 0], ['2027-01', 0], ['2027-02', 1],
    ]);
  });

  it('atravessa a virada do ano', () => {
    expect(fillSeasonality('2026-01-05', 2, []).map((m) => m.month)).toEqual(['2025-11', '2025-12', '2026-01']);
  });

  it('linha sem mês ou fora da janela não desloca o eixo', () => {
    expect(fillSeasonality('2026-03-01', 1, [row('2025-12', 9, 1), { reservations: 5 }]).map((m) => m.month))
      .toEqual(['2026-02', '2026-03']);
  });
});

describe('noSeasonReservations', () => {
  // Com o preenchimento, a lista nunca vem vazia: o estado "Nenhuma reserva nesses meses." passou a
  // depender de todos os meses estarem em zero (qa-redteam de 20/11, 🟡 do PR #195).
  it('hotel sem reserva na janela: verdadeiro, mesmo com 13 meses preenchidos', () => {
    expect(noSeasonReservations(fillSeasonality('2026-11-16', 12, []))).toBe(true);
  });

  it('um mês com reserva basta para mostrar o gráfico', () => {
    expect(noSeasonReservations(fillSeasonality('2026-11-16', 12, [{ month: '2026-05', reservations: 1, avg_nights: 2 }]))).toBe(false);
  });
});

describe('appliedPeriod — o De/Até aplica na hora, só quando a data é válida (F7 da SPEC-10)', () => {
  const atual = { start: '2026-11-01', end: '2026-11-26' };
  it('data válida vira o período consultado', () => {
    expect(appliedPeriod(atual, { start: '2026-10-01', end: '2026-10-31' })).toEqual({ start: '2026-10-01', end: '2026-10-31' });
  });
  it('data incompleta, invertida ou de mais de um ano mantém o período anterior', () => {
    expect(appliedPeriod(atual, { start: '', end: '2026-10-31' })).toBe(atual);
    expect(appliedPeriod(atual, { start: '2026-11-20', end: '2026-11-01' })).toBe(atual);
    expect(appliedPeriod(atual, { start: '2025-01-01', end: '2026-11-26' })).toBe(atual);
  });
});
