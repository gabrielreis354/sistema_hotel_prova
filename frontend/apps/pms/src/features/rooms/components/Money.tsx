import { decimalToCents, formatBRL, MoneyParseError } from '@hotel/domain';

/**
 * Valor DECIMAL do backend ("150.00") na tela: sempre via @hotel/domain, nunca Number().
 * Nasce local — `Money` é candidato a promoção (CATALOGO.md).
 */
export function Money({ value }: { value: string | null | undefined }) {
  if (value === null || value === undefined) return <span className="text-gray-400">—</span>;
  try {
    return <span className="tabular-nums">{formatBRL(decimalToCents(value))}</span>;
  } catch (e) {
    if (!(e instanceof MoneyParseError)) throw e;
    return <span className="text-status-maintenance">Valor inválido</span>;
  }
}
