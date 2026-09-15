/**
 * Máquinas de estado de reserva e quarto — a MESMA verdade do backend (CLAUDE.md §3),
 * replicada no frontend para habilitar/desabilitar ações na UI antes de bater no servidor.
 *
 * Regra de ouro: ALLOWLIST (fail-safe). Uma transição não listada é proibida por padrão.
 * O servidor continua sendo a autoridade; isto é só para o botão certo aparecer.
 */

export const RESERVATION_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'CHECKED_IN',
  'CHECKED_OUT',
  'CANCELLED',
] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

// PENDING → CONFIRMED → CHECKED_IN → CHECKED_OUT ; PENDING/CONFIRMED → CANCELLED.
const RESERVATION_TRANSITIONS: Record<ReservationStatus, ReservationStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['CHECKED_IN', 'CANCELLED'],
  CHECKED_IN: ['CHECKED_OUT'],
  CHECKED_OUT: [],
  CANCELLED: [],
};

export function canTransitionReservation(from: ReservationStatus, to: ReservationStatus): boolean {
  return RESERVATION_TRANSITIONS[from].includes(to);
}

/** Só PENDING e CONFIRMED podem cancelar (CLAUDE.md). */
export function canCancelReservation(status: ReservationStatus): boolean {
  return canTransitionReservation(status, 'CANCELLED');
}

export function canCheckIn(status: ReservationStatus): boolean {
  return canTransitionReservation(status, 'CHECKED_IN');
}

export function canCheckOut(status: ReservationStatus): boolean {
  return canTransitionReservation(status, 'CHECKED_OUT');
}

export const ROOM_STATUSES = ['AVAILABLE', 'OCCUPIED', 'CLEANING', 'MAINTENANCE'] as const;
export type RoomStatus = (typeof ROOM_STATUSES)[number];

// AVAILABLE → OCCUPIED (check-in) → CLEANING (check-out) → AVAILABLE (limpeza concluída).
// MAINTENANCE é bloqueio manual; entra/sai de AVAILABLE.
const ROOM_TRANSITIONS: Record<RoomStatus, RoomStatus[]> = {
  AVAILABLE: ['OCCUPIED', 'MAINTENANCE'],
  OCCUPIED: ['CLEANING'],
  CLEANING: ['AVAILABLE'],
  MAINTENANCE: ['AVAILABLE'],
};

export function canTransitionRoom(from: RoomStatus, to: RoomStatus): boolean {
  return ROOM_TRANSITIONS[from].includes(to);
}

/**
 * Metadados de exibição de cada status de quarto: rótulo PT-BR e a chave do token de cor
 * do design system (`status.<key>` no preset do Tailwind). A cor NUNCA vai sozinha — o
 * componente sempre acompanha o `label`.
 */
export const ROOM_STATUS_META: Record<RoomStatus, { label: string; token: string }> = {
  AVAILABLE: { label: 'Livre', token: 'free' },
  OCCUPIED: { label: 'Ocupado', token: 'occupied' },
  CLEANING: { label: 'Limpeza', token: 'cleaning' },
  MAINTENANCE: { label: 'Manutenção', token: 'maintenance' },
};

export const RESERVATION_STATUS_LABEL: Record<ReservationStatus, string> = {
  PENDING: 'Pendente',
  CONFIRMED: 'Confirmada',
  CHECKED_IN: 'Hospedado',
  CHECKED_OUT: 'Finalizada',
  CANCELLED: 'Cancelada',
};
