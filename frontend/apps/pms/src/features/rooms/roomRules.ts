import { canTransitionRoom, ROOM_STATUSES, type RoomStatus } from '@hotel/domain';
import type { Role } from '../../types.js';
import type { Room } from './roomsApi.js';

/**
 * Regras de tela do módulo de quartos. Lógica pura, sem React — testada em roomRules.test.ts.
 * O backend continua sendo a autoridade; aqui só se decide o que habilitar e com que motivo.
 */

/** Espelha o backend: POST/PUT/DELETE de /rooms e /room-categories exigem ADMIN. */
export function canWriteRooms(role: Role | undefined): boolean {
  return role === 'ADMIN';
}

export const READ_ONLY_REASON = 'Só o administrador cadastra e altera quartos e categorias.';

export interface StatusOption {
  status: RoomStatus;
  enabled: boolean;
  /** Por que está desabilitado — mostrado ao lado da opção (ação indisponível tem motivo). */
  reason?: string;
}

/**
 * Status que o administrador pode escolher no formulário, a partir do atual.
 *
 * Ocupar e mandar para limpeza são efeitos do check-in e do check-out — se o formulário
 * permitisse, um quarto apareceria ocupado sem hóspede, ou livre com hóspede dentro. O que
 * sobra para a mão é o que não tem operação própria: bloquear para manutenção, desbloquear e
 * liberar depois da limpeza. Tudo filtrado pela máquina de estados de @hotel/domain (allowlist).
 *
 * `current` ausente = quarto novo, que nasce Livre ou em Manutenção.
 */
export function roomStatusOptions(current?: RoomStatus): StatusOption[] {
  return ROOM_STATUSES.map((status) => {
    if (status === current) return { status, enabled: true };
    if (status === 'OCCUPIED') return { status, enabled: false, reason: 'Só o check-in ocupa o quarto.' };
    if (status === 'CLEANING') return { status, enabled: false, reason: 'A limpeza começa no check-out.' };
    if (!current) return { status, enabled: true };
    if (current === 'OCCUPIED') {
      return { status, enabled: false, reason: 'Quarto ocupado: o status muda no check-out.' };
    }
    if (canTransitionRoom(current, status)) return { status, enabled: true };
    return { status, enabled: false, reason: 'Libere o quarto (Livre) antes.' };
  });
}

/** Motivo para não excluir o quarto, ou null se pode. */
export function roomDeleteBlockReason(status: RoomStatus | undefined): string | null {
  return status === 'OCCUPIED' ? 'Quarto ocupado não pode ser excluído. Faça o check-out antes.' : null;
}

/** Quantos quartos usam cada categoria — para impedir apagar categoria em uso. */
export function countRoomsByCategory(rooms: Room[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const r of rooms) {
    if (r.category_id) counts.set(r.category_id, (counts.get(r.category_id) ?? 0) + 1);
  }
  return counts;
}

/**
 * Motivo para não excluir a categoria, ou null se pode. O backend aceita o DELETE de uma
 * categoria em uso (soft delete) e deixa os quartos sem categoria — sem tarifa para a
 * reserva calcular. Até o backend recusar com 409, a tela recusa antes.
 */
export function categoryDeleteBlockReason(roomsUsing: number): string | null {
  if (roomsUsing <= 0) return null;
  const quartos = roomsUsing === 1 ? '1 quarto usa' : `${roomsUsing} quartos usam`;
  return `${quartos} esta categoria. Mude a categoria deles antes de excluir.`;
}

const collator = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });

/**
 * Ordena por andar e número ("2" antes de "10"), sem andar por último. A API devolve a
 * coleção sem ordem; ordenar o que já está na tela não é filtrar no cliente — a lista
 * mostrada é exatamente a que a API devolveu.
 */
export function sortRooms(rooms: Room[]): Room[] {
  return [...rooms].sort((a, b) => {
    const fa = a.floor ?? Number.POSITIVE_INFINITY;
    const fb = b.floor ?? Number.POSITIVE_INFINITY;
    if (fa !== fb) return fa - fb;
    return collator.compare(a.number ?? '', b.number ?? '');
  });
}

/** Andar para exibição: 0 é térreo, ausente é traço. */
export function formatFloor(floor: number | null | undefined): string {
  if (floor === null || floor === undefined) return '—';
  return floor === 0 ? 'Térreo' : `${floor}º`;
}
