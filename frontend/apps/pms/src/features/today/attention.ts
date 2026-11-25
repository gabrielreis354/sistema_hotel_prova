import type { StatusTone } from '@hotel/domain';

/** Um item do bloco Atenção: o que pede ação agora, com cor + texto e o caminho para resolver. */
export interface AttentionItem {
  id: 'no-show' | 'maintenance' | 'late-departures' | 'cleaning' | 'pending';
  tone: Extract<StatusTone, 'maintenance' | 'cleaning' | 'booked'>;
  count: number;
  /** Texto inteiro (desktop e leitor de tela). */
  long: string;
  /** Texto curto, para a grade de 2 colunas do celular (estudo de responsividade de 22/11). */
  short: string;
  href?: string;
  to?: string;
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/**
 * Itens do Atenção por gravidade (protótipo de 22/11): dinheiro e quarto bloqueado primeiro, depois
 * atraso e limpeza, depois as pendentes. Tipo sem ocorrência não aparece; com mais casos cresce a
 * contagem, não o número de itens. A manutenção vem da fita (core), o resto como antes.
 */
export function attentionItems(n: { noShow: number; maintenance: number; lateDepartures: number; cleaning: number; pendingTooLong: number }): AttentionItem[] {
  const items: AttentionItem[] = [
    {
      id: 'no-show',
      tone: 'maintenance',
      count: n.noShow,
      long: plural(n.noShow, 'chegada sem pagamento — risco de no-show', 'chegadas sem pagamento — risco de no-show'),
      short: 'sem pagamento',
      href: '#chegadas-titulo',
    },
    {
      id: 'maintenance',
      tone: 'maintenance',
      count: n.maintenance,
      long: plural(n.maintenance, 'quarto em manutenção', 'quartos em manutenção'),
      short: 'em manutenção',
      href: '#fita-titulo',
    },
    {
      id: 'late-departures',
      tone: 'cleaning',
      count: n.lateDepartures,
      long: plural(n.lateDepartures, 'saída atrasada', 'saídas atrasadas'),
      short: plural(n.lateDepartures, 'saída atrasada', 'saídas atrasadas'),
      href: '#saidas-titulo',
    },
    {
      id: 'cleaning',
      tone: 'cleaning',
      count: n.cleaning,
      long: plural(n.cleaning, 'quarto em limpeza', 'quartos em limpeza'),
      short: 'em limpeza',
      href: '#limpeza-titulo',
    },
    {
      id: 'pending',
      tone: 'booked',
      count: n.pendingTooLong,
      long: plural(n.pendingTooLong, 'reserva pendente há mais de 48 h', 'reservas pendentes há mais de 48 h'),
      short: 'pendentes +48 h',
      to: '/reservas',
    },
  ];
  return items.filter((i) => i.count > 0);
}
