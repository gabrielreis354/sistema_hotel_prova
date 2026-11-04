import { decimalToCents, formatBRL, sumCents } from '@hotel/domain';

/** Rótulo dos meios do backend (`PAYMENT_METHODS` do core). Meio novo aparece com o código, sem quebrar. */
const METHOD_LABELS: Record<string, string> = {
  PIX: 'PIX',
  CARTAO_CREDITO: 'Cartão de crédito',
  CARTAO_DEBITO: 'Cartão de débito',
  DINHEIRO: 'Dinheiro',
};

export function methodLabel(method: string | undefined): string {
  if (!method) return 'Sem meio informado';
  return METHOD_LABELS[method] ?? method;
}

export interface ShareInput {
  key: string;
  label: string;
  count: number;
  /** Valor em reais como o analytics devolve: string DECIMAL desde a H.3 (número no core antigo). */
  value: string | number;
}

export interface ShareRow {
  key: string;
  label: string;
  count: number;
  amount: string;
  /** Fração do total, de 0 a 1 — largura da barra. */
  share: number;
  percent: string;
}

const percent = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/**
 * Participação de cada linha no total, calculada em centavos: a soma das partes bate com o total
 * exibido. O `pct` que o payment-mix já traz não é usado — a categoria não traz, e as duas
 * tabelas precisam da mesma conta.
 */
export function toShares(items: ShareInput[]): ShareRow[] {
  const cents = items.map((i) => decimalToCents(i.value));
  const total = sumCents(cents);
  return items.map((item, idx) => {
    const share = total > 0 ? cents[idx]! / total : 0;
    return {
      key: item.key,
      label: item.label,
      count: item.count,
      amount: formatBRL(cents[idx]!),
      share,
      percent: `${percent.format(share * 100)}%`,
    };
  });
}

/** Altura de cada barra em % do maior valor. Tudo zero (ou vazio) dá barras zeradas, não divisão por zero. */
export function scaleToMax(values: number[]): number[] {
  const max = Math.max(0, ...values);
  return values.map((v) => (max > 0 && v > 0 ? (v / max) * 100 : 0));
}
