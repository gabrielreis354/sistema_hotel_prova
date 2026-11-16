import { decimalToCents, formatBRL, MoneyParseError } from '@hotel/domain';

/**
 * Valor DECIMAL do backend ("150.00") na tela: sempre via @hotel/domain, nunca Number().
 * Não é o `Money` do @hotel/ui, que recebe centavos: este recebe o DECIMAL em texto e mostra
 * "—" ou "Valor inválido". Renomeado na T-08.6 para o import errado não compilar.
 */
export function DecimalMoney({ value }: { value: string | null | undefined }) {
  if (value === null || value === undefined) return <span className="text-gray-400">—</span>;
  try {
    return <span className="tabular-nums">{formatBRL(decimalToCents(value))}</span>;
  } catch (e) {
    if (!(e instanceof MoneyParseError)) throw e;
    return <span className="text-status-maintenance">Valor inválido</span>;
  }
}
