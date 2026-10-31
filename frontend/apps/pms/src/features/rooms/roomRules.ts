import { canTransitionRoom, ROOM_STATUSES, type RoomStatus } from '@hotel/domain';
import type { Role } from '../../types.js';
import type { Room, RoomCreateBody, RoomInput } from './roomsApi.js';

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

/**
 * O que mudou entre o quarto carregado e o formulário — é só isso que o PUT leva.
 *
 * Reenviar o formulário inteiro grava o `status` de quando a tela abriu: um check-in feito
 * em paralelo voltaria o quarto a Livre com hóspede dentro (achado 🟡-1 do qa-redteam).
 * Mandando só o que o admin alterou, corrigir o andar não toca no status. Objeto vazio =
 * nada a salvar.
 */
export function changedRoomFields(original: RoomInput, edited: RoomInput): Partial<RoomInput> {
  const changes: Partial<RoomInput> = {};
  if (edited.number !== original.number) changes.number = edited.number;
  if (edited.floor !== original.floor) changes.floor = edited.floor;
  if (edited.category_id !== original.category_id) changes.category_id = edited.category_id;
  if (edited.status !== original.status) changes.status = edited.status;
  return changes;
}

/** O quarto gravado no formato do formulário. */
type CreatableStatus = NonNullable<RoomCreateBody['status']>;
const CREATABLE_STATUSES: readonly CreatableStatus[] = ['AVAILABLE', 'MAINTENANCE'];

function isCreatableStatus(status: RoomStatus): status is CreatableStatus {
  return CREATABLE_STATUSES.some((s) => s === status);
}

/**
 * Corpo do cadastro. O backend só aceita quarto novo AVAILABLE ou MAINTENANCE (400 nos
 * outros) — mesma regra de `roomStatusOptions()` sem `current`. null = status fora disso.
 */
export function toRoomCreateBody(input: RoomInput): RoomCreateBody | null {
  const { status, ...rest } = input;
  return isCreatableStatus(status) ? { ...rest, status } : null;
}

export function toRoomInput(room: Room): RoomInput {
  return {
    number: room.number ?? '',
    floor: room.floor ?? null,
    category_id: room.category_id ?? '',
    status: room.status ?? 'AVAILABLE',
  };
}

/**
 * Base do diff da edição: o quarto como estava quando o formulário ABRIU, congelado.
 *
 * O formulário (react-hook-form) não reaplica valores depois de montado; se a base do diff
 * acompanhasse a query viva, um refetch (reconexão, foco) trazendo o quarto já OCCUPIED
 * faria o diff ver "status mudou de OCCUPIED para AVAILABLE" e reenviar o status velho —
 * desfazendo o check-in (🟡-1 da reauditoria). A primeira foto vence; as seguintes são
 * ignoradas.
 */
export function keepFirstSnapshot(frozen: RoomInput | null, latest: RoomInput | null): RoomInput | null {
  return frozen ?? latest;
}

/** Motivo para não excluir o quarto, ou null se pode. */
export function roomDeleteBlockReason(status: RoomStatus | undefined): string | null {
  return status === 'OCCUPIED' ? 'Quarto ocupado não pode ser excluído. Faça o check-out antes.' : null;
}

/**
 * Quantos quartos usam cada categoria — só informação na coluna "Quartos" da lista, a partir
 * da lista de quartos já em cache. NÃO decide exclusão: quem recusa apagar categoria em uso é
 * o backend (409), que enxerga o quarto cadastrado agora há pouco por outra pessoa e não
 * depende de baixar a coleção inteira. Com a paginação (T-06.10) esta contagem deixa de ser
 * completa e a coluna precisa de um campo do backend.
 */
export function countRoomsByCategory(rooms: Room[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const r of rooms) {
    if (r.category_id) counts.set(r.category_id, (counts.get(r.category_id) ?? 0) + 1);
  }
  return counts;
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
