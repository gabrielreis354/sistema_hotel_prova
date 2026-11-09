import { formatBRL, type Cents } from '@hotel/domain';
import { cn } from './cn.js';

/**
 * Valor em reais: algarismos tabulares, sempre duas casas, sem quebrar linha. Recebe CENTAVOS
 * (já convertidos por `decimalToCents` do `@hotel/domain`) — o DECIMAL do `pg` nunca passa por
 * `Number()`. O alinhamento à direita é do pai (coluna de valor).
 *
 * Promovido de `features/reservations/components/primitives.tsx` na T-05.3 (painel Hoje,
 * segundo módulo a precisar).
 */
export function Money({ cents, className }: { cents: Cents; className?: string }) {
  return <span className={cn('whitespace-nowrap tabular-nums', className)}>{formatBRL(cents)}</span>;
}
