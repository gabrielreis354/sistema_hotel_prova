/**
 * Regras do painel "Hoje" (T-05.3) — sem React, sem rede, testadas em todayLogic.test.ts.
 *
 * Tudo aqui trabalha sobre conjuntos JÁ recortados pelo servidor (?status= e ?from=&to=), do
 * tamanho do hotel — nunca sobre a coleção de reservas inteira.
 * Datas são dias de calendário 'yyyy-MM-dd' no fuso do hotel (`todayISO()` do @hotel/domain):
 * comparar as strings é comparar os dias.
 */

/** O que o painel lê de uma reserva da listagem (ReservationListItem cabe aqui). */
export interface TodayReservation {
  id?: string;
  status?: string;
  check_in_date?: string;
  check_out_date?: string;
  guest?: { id?: string; full_name?: string } | null;
  room?: { id?: string; number?: string; status?: string } | null;
}

const ROOM_BLOCK_LABEL: Record<string, string> = {
  OCCUPIED: 'ainda ocupado',
  CLEANING: 'em limpeza',
  MAINTENANCE: 'em manutenção',
};

/**
 * Por que o check-in da linha não pode sair agora, ou null. Só avisa antes do toque: quem decide
 * é o servidor (409 ROOM_NOT_AVAILABLE), que também confere os quartos extras.
 */
export function checkInBlockedReason(room: { number?: string; status?: string } | null | undefined): string | null {
  if (!room?.status || room.status === 'AVAILABLE') return null;
  return `Quarto ${room.number ?? '—'} ${ROOM_BLOCK_LABEL[room.status] ?? 'indisponível'}`;
}

export interface ArrivalRow<R extends TodayReservation = TodayReservation> {
  reservation: R;
  /** Entrada era antes de hoje e o hóspede ainda não chegou. */
  late: boolean;
  /** Está no `no_show_risk` do /analytics/alerts: CONFIRMED de hoje sem nenhum pagamento PAID. */
  noShowRisk: boolean;
}

export interface DepartureRow<R extends TodayReservation = TodayReservation> {
  reservation: R;
  /** Saída era antes de hoje e o hóspede continua na casa (D-9: rótulo próprio). */
  late: boolean;
}

const ARRIVING = ['PENDING', 'CONFIRMED'];

/** Número do quarto em ordem natural ("2" antes de "10"); sem quarto vai para o fim. */
function byRoom(a: TodayReservation, b: TodayReservation): number {
  const ra = a.room?.number ?? '';
  const rb = b.room?.number ?? '';
  if (ra !== rb) {
    if (!ra) return 1;
    if (!rb) return -1;
    return ra.localeCompare(rb, 'pt-BR', { numeric: true });
  }
  return (a.guest?.full_name ?? '').localeCompare(b.guest?.full_name ?? '', 'pt-BR');
}

/**
 * Chegadas: PENDING ou CONFIRMED com entrada hoje ou antes (atrasada). Ordem: risco de no-show
 * primeiro (CA-05.3.f — "sobe para o topo"), depois as atrasadas, depois por quarto.
 * O no-show é cruzado pelo id: um alerta velho de reserva que já fez check-in não marca nada,
 * porque ela não está mais nesta lista.
 */
export function arrivalRows<R extends TodayReservation>(upcoming: R[], today: string, noShowIds: ReadonlySet<string>): ArrivalRow<R>[] {
  return upcoming
    .filter((r) => ARRIVING.includes(r.status ?? '') && !!r.check_in_date && r.check_in_date <= today)
    .map((r) => ({
      reservation: r,
      late: (r.check_in_date ?? '') < today,
      noShowRisk: !!r.id && noShowIds.has(r.id),
    }))
    .sort((a, b) => {
      if (a.noShowRisk !== b.noShowRisk) return a.noShowRisk ? -1 : 1;
      if (a.late !== b.late) return a.late ? -1 : 1;
      return byRoom(a.reservation, b.reservation);
    });
}

/** Saídas: CHECKED_IN com saída hoje ou já vencida (atrasada primeiro). */
export function departureRows<R extends TodayReservation>(inHouse: R[], today: string): DepartureRow<R>[] {
  return inHouse
    .filter((r) => r.status === 'CHECKED_IN' && !!r.check_out_date && r.check_out_date <= today)
    .map((r) => ({ reservation: r, late: (r.check_out_date ?? '') < today }))
    .sort((a, b) => {
      if (a.late !== b.late) return a.late ? -1 : 1;
      return byRoom(a.reservation, b.reservation);
    });
}

/** Hóspedes na casa: todo CHECKED_IN, por quarto. */
export function inHouseRows<R extends TodayReservation>(inHouse: R[]): R[] {
  return inHouse.filter((r) => r.status === 'CHECKED_IN').sort(byRoom);
}

/**
 * "Vendidos hoje" (D-6, decisão do Gabriel de 04/11): ocupados agora + chegadas DE HOJE que
 * ainda não fizeram check-in. A chegada atrasada não entra — a noite dela já passou.
 * Reserva com vários quartos conta 1 (só o principal vem na lista — D-5, pendência).
 */
export function soldToday(occupied: number, arrivals: ArrivalRow[]): number {
  return occupied + arrivals.filter((a) => !a.late).length;
}

// ─── /analytics/alerts ───────────────────────────────────────────────────────────────

export interface CleaningRoom {
  id: string;
  number: string;
  category: string;
  /** Instante em que o quarto entrou em limpeza (ISO), quando o servidor informa. */
  since?: string;
}

export interface TodayAlerts {
  noShowIds: ReadonlySet<string>;
  cleaning: CleaningRoom[];
  pendingTooLong: number;
}

/**
 * Formato bruto dos alertas, com SÓ os campos que existem igual no core e no analytics-service
 * da H.3 (PR 109). `amount` (número hoje, string depois), `guest_phone` (sai) e `guest_id`
 * (entra) ficam de fora de propósito: o nome, o quarto e o valor da chegada vêm da lista de
 * reservas do core. Assim o rebase sobre a H.3 não quebra o painel.
 */
export interface RawAlerts {
  no_show_risk?: { reservation_id?: string }[];
  cleaning_pending?: { room_id?: string; room_number?: string; category?: string; cleaning_since?: string }[];
  pending_too_long?: { reservation_id?: string }[];
}

export function toTodayAlerts(raw: RawAlerts): TodayAlerts {
  const noShowIds = new Set<string>();
  for (const n of raw.no_show_risk ?? []) if (n.reservation_id) noShowIds.add(n.reservation_id);

  const cleaning: CleaningRoom[] = [];
  for (const c of raw.cleaning_pending ?? []) {
    if (!c.room_id) continue;
    cleaning.push({ id: c.room_id, number: c.room_number ?? '—', category: c.category ?? '', since: c.cleaning_since ?? undefined });
  }

  return { noShowIds, cleaning, pendingTooLong: (raw.pending_too_long ?? []).length };
}

/** Percentual de ocupação em pt-BR, sem casas inúteis ("72,5%", "100%"). Não é dinheiro. */
export function formatPercent(rate: number): string {
  return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(rate)}%`;
}
