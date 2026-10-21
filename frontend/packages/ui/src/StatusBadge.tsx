import { ROOM_STATUS_META, type RoomStatus, type StatusTone } from '@hotel/domain';
import { cn } from './cn.js';

// Mapa explícito tom -> classe de fundo. Tailwind faz purge estático, então
// `bg-status-${token}` dinâmico seria removido do build — listamos as classes inteiras.
const DOT_CLASS: Record<StatusTone, string> = {
  free: 'bg-status-free',
  booked: 'bg-status-booked',
  occupied: 'bg-status-occupied',
  cleaning: 'bg-status-cleaning',
  maintenance: 'bg-status-maintenance',
};

/**
 * Duas formas de uso:
 * - `status` de quarto (a de sempre): rótulo e tom vêm de `ROOM_STATUS_META`.
 * - `tone` + `label`: qualquer outro status (reserva, parcela...). O módulo dono do status
 *   decide o tom e o rótulo; o selo só garante que cor e texto andem juntos.
 */
export type StatusBadgeProps = { className?: string } & (
  | { status: RoomStatus; tone?: never; label?: never }
  | { tone: StatusTone; label: string; status?: never }
);

/**
 * Selo de status. A cor NUNCA vai sozinha (§10, acessibilidade): o rótulo de texto
 * acompanha sempre o ponto colorido.
 */
export function StatusBadge(props: StatusBadgeProps) {
  const { tone, label } =
    props.status !== undefined
      ? { tone: ROOM_STATUS_META[props.status].token, label: ROOM_STATUS_META[props.status].label }
      : { tone: props.tone, label: props.label };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full bg-gray-50 px-2 py-0.5 text-sm text-gray-700',
        props.className,
      )}
    >
      <span className={cn('h-2 w-2 shrink-0 rounded-full', DOT_CLASS[tone])} aria-hidden="true" />
      {label}
    </span>
  );
}
