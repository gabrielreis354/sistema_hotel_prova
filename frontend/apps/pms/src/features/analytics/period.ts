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

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** 'yyyy-MM' do backend → 'out/26', rótulo curto do eixo. Sem `Date`: mês não tem fuso. */
export function monthLabel(month: string): string {
  const [year, mm] = month.split('-');
  const name = MONTHS[Number(mm) - 1];
  return name && year ? `${name}/${year.slice(2)}` : month;
}
