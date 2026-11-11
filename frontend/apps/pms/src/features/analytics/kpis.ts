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
 * Desde a T-01.4/H.3 o analytics-service devolve dinheiro como string DECIMAL ("312.50"), sem
 * `::float`. O `decimalToCents` aceita string e número (o core antigo devolvia número) e só
 * arredonda o número — a string vira centavos exatos.
 */
function money(value: string | number | undefined): string {
  return value === undefined ? NO_VALUE : formatBRL(decimalToCents(value));
}

/**
 * Monta os cartões do dia a partir da ocupação e da receita recebida hoje. Cada fonte pode
 * faltar sozinha: a receita fora do ar não apaga a ocupação.
 */
export function buildKpis(occupancy: Occupancy | undefined, revenueToday: string | number | undefined): Kpi[] {
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
