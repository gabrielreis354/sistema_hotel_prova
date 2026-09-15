import { ROOM_STATUS_META, type RoomStatus } from '@hotel/domain';
import { cn } from './cn.js';

// Mapa explícito status -> classe de fundo. Tailwind faz purge estático, então
// `bg-status-${token}` dinâmico seria removido do build — listamos as classes inteiras.
const DOT_CLASS: Record<RoomStatus, string> = {
  AVAILABLE: 'bg-status-free',
  OCCUPIED: 'bg-status-occupied',
  CLEANING: 'bg-status-cleaning',
  MAINTENANCE: 'bg-status-maintenance',
};

export interface StatusBadgeProps {
  status: RoomStatus;
  className?: string;
}

/**
 * Selo de status de quarto. A cor NUNCA vai sozinha (§10, acessibilidade): o rótulo
 * de texto acompanha sempre o ponto colorido.
 */
export function StatusBadge({ status, className }: StatusBadgeProps) {
  const meta = ROOM_STATUS_META[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full bg-gray-50 px-2 py-0.5 text-sm text-gray-700',
        className,
      )}
    >
      <span className={cn('h-2 w-2 rounded-full', DOT_CLASS[status])} aria-hidden="true" />
      {meta.label}
    </span>
  );
}
