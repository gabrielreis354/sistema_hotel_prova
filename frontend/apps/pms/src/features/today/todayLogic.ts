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
 * Formato bruto dos alertas do analytics-service, só com o que o painel usa: o nome, o quarto e
 * o valor da chegada vêm da lista de reservas do core. `category` pode ser nula porque eventos de
 * agregados diferentes chegam em qualquer ordem, e `totals` existe porque cada lista tem teto.
 */
export interface RawAlerts {
  no_show_risk?: { reservation_id?: string }[];
  cleaning_pending?: { room_id?: string; room_number?: string; category?: string | null; cleaning_since?: string }[];
  pending_too_long?: { reservation_id?: string }[];
  totals?: { pending_too_long?: number };
}

export function toTodayAlerts(raw: RawAlerts): TodayAlerts {
  const noShowIds = new Set<string>();
  for (const n of raw.no_show_risk ?? []) if (n.reservation_id) noShowIds.add(n.reservation_id);

  const cleaning: CleaningRoom[] = [];
  for (const c of raw.cleaning_pending ?? []) {
    if (!c.room_id) continue;
    cleaning.push({ id: c.room_id, number: c.room_number ?? '—', category: c.category ?? '', since: c.cleaning_since ?? undefined });
  }

  return { noShowIds, cleaning, pendingTooLong: raw.totals?.pending_too_long ?? (raw.pending_too_long ?? []).length };
}

/** Percentual de ocupação em pt-BR, sem casas inúteis ("72,5%", "100%"). Não é dinheiro. */
export function formatPercent(rate: number): string {
  return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(rate)}%`;
}

/** Itens visíveis por bloco antes de "Ver todas" (SPEC-08, T-08.4; GUIA_UI_CORPORATIVA §5). */
export const BLOCK_LIMIT = 8;

/**
 * Corte do bloco: os `limit` primeiros e quantos ficaram de fora. A ordem vem de quem chama
 * (arrivalRows e departureRows já põem alerta e atraso primeiro), então o corte nunca esconde o
 * que pede atenção.
 */
export function visibleRows<T>(rows: readonly T[], expanded: boolean, limit = BLOCK_LIMIT): { shown: T[]; hidden: number } {
  if (expanded || rows.length <= limit) return { shown: [...rows], hidden: 0 };
  return { shown: rows.slice(0, limit), hidden: rows.length - limit };
}

/**
 * Para onde vai o foco depois de "Ver todas" ou "Mostrar menos" (ressalva 🟡2 da T-08.4).
 * - Expandir: os itens novos entram ANTES do botão, então o próximo Tab pulava para o bloco
 *   seguinte. O foco vai para o primeiro item novo, o do corte.
 * - Recolher: a lista encolhe e o botão sobe para fora da vista (o iOS não ancora a rolagem).
 *   O foco fica no botão, e quem chama o traz de volta para a vista.
 */
export type ToggleFocusTarget = { kind: 'item'; index: number } | { kind: 'button' };

export function toggleFocusTarget(expanding: boolean, total: number, limit = BLOCK_LIMIT): ToggleFocusTarget {
  return expanding && total > limit ? { kind: 'item', index: limit } : { kind: 'button' };
}

/** Selo de alerta da chegada: `label` na tela, `full` para o leitor de tela e a dica do mouse. */
export interface ArrivalFlag {
  tone: 'maintenance' | 'cleaning';
  label: string;
  full: string;
}

/**
 * Selos da chegada, curtos para caber ao lado de "Quarto 101 · 3 diárias" no celular (ressalva
 * 🟡1 da T-08.4, decisão do Sirlande de 16/11). Na linha própria, cada chegada com selo ganhava
 * uma linha a mais, e o painel passava dos 3.000 px do CA-08.i em 375 px. O texto completo não
 * se perde: vai em `full`, e o "risco de no-show" também está no bloco Atenção.
 */
export function arrivalFlags(row: ArrivalRow): ArrivalFlag[] {
  const flags: ArrivalFlag[] = [];
  if (row.noShowRisk) {
    flags.push({ tone: 'maintenance', label: 'Sem pagamento', full: 'Sem pagamento · risco de no-show' });
  }
  const entrada = row.reservation.check_in_date;
  if (row.late && entrada) {
    const [ano, mes, dia] = entrada.split('-');
    flags.push({
      tone: 'cleaning',
      label: `Atrasada · ${dia}/${mes}`,
      full: `Chegada atrasada · entrada era ${dia}/${mes}/${ano}`,
    });
  }
  return flags;
}

// ─── Sem conexão e indicadores atrasados (SPEC-11, T-11.4) ──────────────────────────────

/**
 * Estado de carga de um bloco (CA-11.h). Sem rede, a consulta sem dado fica pausada com
 * `isPending` para sempre: mostrar "Carregando…" mente, e cair no vazio também. Conta o dado, não o
 * `isPending`: a consulta que errou e depois pausou também está sem dado, e o "Tentar de novo" do
 * erro só pausaria de novo (🟢-1 do qa-redteam de 22/11). Com dado já carregado, o bloco mostra o
 * dado, e a faixa do topo avisa que pode estar velho.
 */
export function loadState(q: { isPending: boolean; isPaused: boolean; data?: unknown }): { isLoading: boolean; isOffline: boolean } {
  return { isLoading: q.isPending && !q.isPaused, isOffline: q.isPaused && q.data === undefined };
}

/**
 * Dado na tela que pode estar velho: há dado, o último refetch falhou e o aparelho está online
 * (Wi-Fi sem internet, que o `onlineManager` não percebe). Sem rede, a faixa do topo já avisa,
 * e o bloco não repete (revisão dos PRs da SPEC-11, 22/11).
 */
export function isStale(q: { data?: unknown; isError: boolean }, online: boolean): boolean {
  return online && q.data !== undefined && q.isError;
}

/**
 * Atraso do segundo refetch dos indicadores (CA-11.g). O analytics projeta o evento do core
 * alguns instantes depois da resposta (RabbitMQ; consistência eventual, ADR-003): o refetch
 * imediato traz o número velho. 3 s cabem com folga nos 10 s do critério.
 */
export const ANALYTICS_REFETCH_DELAY = 3000;

/**
 * Recarrega os indicadores agora e de novo depois da projeção. Sem otimismo no cache: o cartão só
 * mostra o número que o analytics confirmou. O timer não depende da tela: o QueryClient é do app,
 * e a linha que disparou a ação pode já ter sumido.
 */
export function invalidateAnalyticsSoon(qc: { invalidateQueries: (filters: { queryKey: readonly unknown[] }) => Promise<void> }): void {
  void qc.invalidateQueries({ queryKey: ['analytics'] });
  setTimeout(() => void qc.invalidateQueries({ queryKey: ['analytics'] }), ANALYTICS_REFETCH_DELAY);
}
