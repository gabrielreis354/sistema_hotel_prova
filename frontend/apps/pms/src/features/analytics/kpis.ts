import { decimalToCents, formatBRL } from '@hotel/domain';
import type { Occupancy } from './analyticsApi.js';

/** Um dos 4 números do topo (RT-48, CA-05.6.c). `value` já vem formatado para a tela. */
export interface Kpi {
  id: 'occupancy' | 'adr' | 'revpar' | 'revenue';
  label: string;
  value: string;
  hint: string;
}

/** Sem dado (bloco ainda carregando ou com erro): traço, nunca zero — zero é um número de verdade. */
export const NO_VALUE = '—';

const percent = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/**
 * Os analytics agregam no SQL e devolvem número (`::float`), não a string DECIMAL. O
 * `decimalToCents` aceita os dois e arredonda para centavo antes de formatar.
 */
function money(value: number | undefined): string {
  return value === undefined ? NO_VALUE : formatBRL(decimalToCents(value));
}

/**
 * Monta os cartões do dia a partir da ocupação e da receita recebida hoje. Cada fonte pode
 * faltar sozinha: a receita fora do ar não apaga a ocupação.
 */
export function buildKpis(occupancy: Occupancy | undefined, revenueToday: number | undefined): Kpi[] {
  const rooms = occupancy?.total_rooms;
  const occupied = occupancy?.occupied;
  return [
    {
      id: 'occupancy',
      label: 'Ocupação',
      value: occupancy?.occupancy_rate === undefined ? NO_VALUE : `${percent.format(occupancy.occupancy_rate)}%`,
      hint: rooms === undefined || occupied === undefined ? 'Quartos ocupados agora' : `${occupied} de ${rooms} quartos ocupados agora`,
    },
    { id: 'adr', label: 'Diária média (ADR)', value: money(occupancy?.adr), hint: 'Das estadias que passam por hoje' },
    { id: 'revpar', label: 'RevPAR', value: money(occupancy?.revpar), hint: 'Diária média × ocupação' },
    { id: 'revenue', label: 'Recebido hoje', value: money(revenueToday), hint: 'Pagamentos efetivados hoje' },
  ];
}
