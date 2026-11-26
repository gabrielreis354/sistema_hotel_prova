import { nightsBetween } from '@hotel/domain';
import type { Period } from './analyticsApi.js';

/** Teto do período consultado: um ano (com folga para o 29/02). Mais que isso vira relatório, não tela. */
export const MAX_PERIOD_DAYS = 366;

/** Janelas da sazonalidade oferecidas na tela. O backend aceita 1 a 60. */
export const SEASONALITY_WINDOWS = [6, 12, 24] as const;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Período padrão: do dia 1º do mês corrente até hoje, no fuso do hotel (`today` já vem dele). */
export function defaultPeriod(today: string): Period {
  return { start: `${today.slice(0, 7)}-01`, end: today };
}

/**
 * Janela da receita por mês: do dia 1º do mês de `months - 1` meses atrás até hoje. Com 12, em
 * 30/10/2026, vai de 01/11/2025 a 30/10/2026. A sazonalidade NÃO usa esta janela: o backend
 * conta por mês de check-in a partir de `months` meses atrás (13 barras com 12) e inclui reservas
 * futuras — por isso cada bloco mostra o próprio intervalo.
 */
export function monthlyWindow(today: string, months: number): Period {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7)); // 1–12
  const index = year * 12 + (month - 1) - (months - 1);
  const startYear = Math.floor(index / 12);
  const startMonth = String((index % 12) + 1).padStart(2, '0');
  return { start: `${startYear}-${startMonth}-01`, end: today };
}

/** Mês 'yyyy-MM' ↔ índice contínuo (ano × 12 + mês − 1), para andar mês a mês sem `Date`. */
function monthIndex(month: string): number {
  return Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1;
}

function monthFromIndex(i: number): string {
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
}

/** Todos os meses de `first` a `last` ('yyyy-MM'), inclusive e em ordem. */
function monthRange(first: string, last: string): string[] {
  const months: string[] = [];
  for (let i = monthIndex(first); i <= monthIndex(last); i += 1) months.push(monthFromIndex(i));
  return months;
}

/**
 * Todos os meses da janela, em ordem. O backend só devolve mês que teve pagamento; sem isto,
 * jan e mar viram barras vizinhas e o gerente lê fev como se não existisse. Mês sem linha
 * entra com total 0.
 */
export function fillMonths(window: Period, rows: { month: string; total: number }[]): { month: string; total: number }[] {
  const byMonth = new Map(rows.map((r) => [r.month, r.total]));
  return monthRange(window.start.slice(0, 7), window.end.slice(0, 7)).map((month) => ({ month, total: byMonth.get(month) ?? 0 }));
}

export interface SeasonMonth {
  month: string;
  reservations: number;
  /** `null` no mês sem reserva: média de nada não é zero noite. */
  avg_nights: number | null;
}

/**
 * Sazonalidade com todos os meses, em ordem (achado 3 da revisão de 15/11: o eixo pulava de mar
 * para jun). A janela é a do backend (GetSeasonalityController): começa no mês de
 * `today − months meses` — 13 meses com 12 — e NÃO tem fim, porque reservas futuras entram. Vai
 * até o mais tarde entre o mês de hoje e o último mês devolvido. Linha sem mês ou anterior ao
 * início é ignorada. `today` vem no fuso do hotel, como o do backend (D-68).
 */
export function fillSeasonality(
  today: string,
  months: number,
  rows: { month?: string; reservations?: number; avg_nights?: number }[],
): SeasonMonth[] {
  const first = monthFromIndex(monthIndex(today.slice(0, 7)) - months);
  const valid = rows.filter((r): r is typeof r & { month: string } => typeof r.month === 'string' && r.month >= first);
  const byMonth = new Map(valid.map((r) => [r.month, r]));
  const lastReturned = valid.reduce((max, r) => (r.month > max ? r.month : max), today.slice(0, 7));
  return monthRange(first, lastReturned).map((month) => {
    const r = byMonth.get(month);
    return r
      ? { month, reservations: r.reservations ?? 0, avg_nights: r.avg_nights ?? null }
      : { month, reservations: 0, avg_nights: null };
  });
}

/** Nenhuma reserva na janela: o bloco mostra o estado vazio, não 13 barras em zero. */
export function noSeasonReservations(months: SeasonMonth[]): boolean {
  return months.every((m) => m.reservations === 0);
}

/** Mensagem de erro do período, ou `null` se ele pode ser consultado. */
export function periodError(period: Period): string | null {
  if (!ISO_DATE_RE.test(period.start) || !ISO_DATE_RE.test(period.end)) {
    return 'Informe a data inicial e a final.';
  }
  const days = nightsBetween(period.start, period.end);
  if (days < 0) return 'A data inicial não pode ser depois da final.';
  if (days >= MAX_PERIOD_DAYS) return 'Consulte no máximo um ano por vez.';
  return null;
}

/**
 * O De/Até aplica na hora (F7 da SPEC-10, decisão do Sirlande de 26/11), como os meses do gráfico:
 * sem o "Aplicar", que ficava abaixo da dobra. Só vira consulta a data válida; com a incompleta, a
 * invertida ou a de mais de um ano, as tabelas seguem no período anterior e o campo diz o motivo.
 */
export function appliedPeriod(current: Period, draft: Period): Period {
  return periodError(draft) ? current : draft;
}

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** 'yyyy-MM' do backend → 'out/26', rótulo curto do eixo. Sem `Date`: mês não tem fuso. */
export function monthLabel(month: string): string {
  const [year, mm] = month.split('-');
  const name = MONTHS[Number(mm) - 1];
  return name && year ? `${name}/${year.slice(2)}` : month;
}
