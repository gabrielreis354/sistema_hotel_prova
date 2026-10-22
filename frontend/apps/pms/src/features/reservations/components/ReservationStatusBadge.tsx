import { RESERVATION_STATUS_LABEL, type ReservationStatus } from '@hotel/domain';
import { cn } from '@hotel/ui';
import { isReservationStatus } from '../reservationLogic.js';

// Mapa explícito status -> classe (o purge do Tailwind remove `bg-status-${x}` dinâmico).
// Os tokens são os do preset: âmbar = espera, azul = reservado, verde = na casa,
// cinza = encerrada, vermelho = cancelada.
const DOT_CLASS: Record<ReservationStatus, string> = {
  PENDING: 'bg-status-cleaning',
  CONFIRMED: 'bg-status-booked',
  CHECKED_IN: 'bg-status-occupied',
  CHECKED_OUT: 'bg-status-free',
  CANCELLED: 'bg-status-maintenance',
};

/**
 * Selo de status de RESERVA — ponto colorido e rótulo sempre juntos (princípio 10).
 *
 * Nasce local, de propósito: o `StatusBadge` de `@hotel/ui` é de quarto e está sendo
 * estendido na T-05.1. Quando o segundo módulo precisar de status de reserva (painel do
 * dia, rack), este componente sobe para `packages/ui` junto com a generalização.
 */
export function ReservationStatusBadge({ status, className }: { status?: string; className?: string }) {
  const known = isReservationStatus(status) ? status : undefined;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-gray-100 px-2 py-0.5 text-sm text-gray-800',
        className,
      )}
    >
      <span className={cn('h-2 w-2 rounded-full', known ? DOT_CLASS[known] : 'bg-gray-400')} aria-hidden="true" />
      {known ? RESERVATION_STATUS_LABEL[known] : (status ?? '—')}
    </span>
  );
}
