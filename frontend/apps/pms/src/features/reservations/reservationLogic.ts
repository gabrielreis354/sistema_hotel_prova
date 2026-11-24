/**
 * Lógica pura da recepção de reservas — sem React, sem rede, testada em reservationLogic.test.ts.
 * Dinheiro sempre em centavos inteiros e datas sempre pelo @hotel/domain.
 */
import {
  addDaysISO,
  canCancelReservation,
  canCheckIn,
  canCheckOut,
  checkInWindow,
  decimalToCents,
  formatDateBR,
  multiplyCents,
  nightsBetween,
  parseHotelDate,
  RESERVATION_STATUSES,
  sumCents,
  todayISO,
  type Cents,
  type ReservationStatus,
} from '@hotel/domain';

// ─── Orçamento da estadia, antes de confirmar (CA-05.2.m) ──────────────────────────────

export interface QuotableRoom {
  id?: string;
  number?: string;
  category?: { name?: string; price_per_night?: string } | null;
}

export interface StayQuoteLine {
  roomId: string;
  number: string;
  category: string;
  unitCents: Cents;
  subtotalCents: Cents;
}

export type StayQuote =
  | { ok: true; nights: number; lines: StayQuoteLine[]; totalCents: Cents }
  | { ok: false; reason: string };

/** Noites entre as datas, ou null se alguma não for yyyy-MM-dd válida. */
export function safeNights(checkIn: string, checkOut: string): number | null {
  try {
    return nightsBetween(checkIn, checkOut);
  } catch {
    return null;
  }
}

/**
 * Mesma regra do backend (calculateStayTotal): para cada quarto, preço da categoria × noites.
 * É uma prévia para o balcão — o valor gravado é o que o servidor devolve na criação.
 */
export function quoteStay(rooms: QuotableRoom[], checkIn: string, checkOut: string): StayQuote {
  const nights = safeNights(checkIn, checkOut);
  if (nights === null) return { ok: false, reason: 'Informe as datas de entrada e saída.' };
  if (nights <= 0) return { ok: false, reason: 'A saída precisa ser depois da entrada.' };
  if (rooms.length === 0) return { ok: false, reason: 'Escolha ao menos um quarto.' };

  const lines: StayQuoteLine[] = [];
  for (const room of rooms) {
    const price = room.category?.price_per_night;
    if (!price) return { ok: false, reason: `O quarto ${room.number ?? ''} está sem tarifa na categoria.` };
    const unitCents = decimalToCents(price);
    lines.push({
      roomId: room.id ?? '',
      number: room.number ?? '—',
      category: room.category?.name ?? '',
      unitCents,
      subtotalCents: multiplyCents(unitCents, nights),
    });
  }
  return { ok: true, nights, lines, totalCents: sumCents(lines.map((l) => l.subtotalCents)) };
}

// ─── Ações da reserva: habilitada ou desabilitada COM motivo (CA-05.2.d, e) ─────────────

export interface ActionState {
  enabled: boolean;
  /** Por que está desabilitada — sempre presente quando enabled = false. */
  reason?: string;
}

export interface ReservationActions {
  checkIn: ActionState;
  checkOut: ActionState;
  cancel: ActionState;
}

// PENDING e CONFIRMED fazem check-in (PENDING é o walk-in, decisão de 24/10/2026).
const CHECK_IN_BLOCKED: Partial<Record<ReservationStatus, string>> = {
  CHECKED_IN: 'O hóspede já fez check-in.',
  CHECKED_OUT: 'Estadia encerrada.',
  CANCELLED: 'Reserva cancelada.',
};

const CHECK_OUT_BLOCKED: Partial<Record<ReservationStatus, string>> = {
  PENDING: 'Check-out só depois do check-in.',
  CONFIRMED: 'Check-out só depois do check-in.',
  CHECKED_OUT: 'O check-out já foi feito.',
  CANCELLED: 'Reserva cancelada.',
};

const CANCEL_BLOCKED: Partial<Record<ReservationStatus, string>> = {
  CHECKED_IN: 'Hóspede no quarto: não dá para cancelar — faça o check-out.',
  CHECKED_OUT: 'Estadia encerrada: não dá para cancelar.',
  CANCELLED: 'A reserva já está cancelada.',
};

const UNKNOWN_STATUS = 'Situação da reserva desconhecida — recarregue a página.';

function action(allowed: boolean, blocked: string | undefined): ActionState {
  return allowed ? { enabled: true } : { enabled: false, reason: blocked ?? UNKNOWN_STATUS };
}

export interface StayDates {
  check_in_date?: string | null;
  check_out_date?: string | null;
}

// Status permite, mas as datas não (regra de 15/11/2026): o servidor responderia 422.
function checkInByDates(stay: StayDates | undefined, today: string): ActionState {
  if (!stay?.check_in_date || !stay.check_out_date) return { enabled: true };
  const window = checkInWindow(stay.check_in_date, stay.check_out_date, today);
  if (window === 'TOO_EARLY') {
    return { enabled: false, reason: `Check-in só a partir de ${formatDateBR(stay.check_in_date)}.` };
  }
  if (window === 'EXPIRED') {
    const saida = stay.check_out_date === today ? 'a saída é hoje' : `a saída era ${formatDateBR(stay.check_out_date)}`;
    return { enabled: false, reason: `Reserva vencida: ${saida}. Cancele a reserva em vez de fazer o check-in.` };
  }
  return { enabled: true };
}

/**
 * Quais ações a recepção pode fazer agora. A decisão vem da allowlist de @hotel/domain
 * (fail-safe: status desconhecido desabilita tudo) e, no check-in, da janela de datas;
 * este arquivo só acrescenta o motivo. `stay` traz as datas da reserva.
 */
export function reservationActions(
  status: string | undefined,
  stay?: StayDates,
  today: string = todayISO(),
): ReservationActions {
  const known = isReservationStatus(status) ? status : undefined;
  if (!known) {
    const off = { enabled: false, reason: UNKNOWN_STATUS };
    return { checkIn: off, checkOut: off, cancel: off };
  }
  const byStatus = action(canCheckIn(known), CHECK_IN_BLOCKED[known]);
  return {
    checkIn: byStatus.enabled ? checkInByDates(stay, today) : byStatus,
    checkOut: action(canCheckOut(known), CHECK_OUT_BLOCKED[known]),
    cancel: action(canCancelReservation(known), CANCEL_BLOCKED[known]),
  };
}

export function isReservationStatus(value: string | undefined): value is ReservationStatus {
  return RESERVATION_STATUSES.some((s) => s === value);
}

// ─── Conta em linha do tempo (CA-05.2.h) ───────────────────────────────────────────────

export interface BillLike {
  status?: string;
  check_in_date?: string;
  check_out_date?: string;
  room_total?: number;
  balance_due?: number;
  consumptions?: {
    id?: string;
    description?: string;
    /** Unidades lançadas (QA 24/11). Ausente em resposta de servidor antigo: vale 1. */
    quantity?: number;
    unit_price?: number;
    amount?: number;
    consumed_at?: string;
  }[];
  /** Consumos estornados (CA-05.2.j). `deleted_by` nulo = sem registro confiável de quem autorizou. */
  voided_consumptions?: {
    id?: string;
    description?: string;
    quantity?: number;
    unit_price?: number;
    amount?: number;
    consumed_at?: string;
    deleted_by?: { name?: string } | null;
  }[];
  payments?: {
    id?: string;
    amount?: number;
    method?: string;
    kind?: string;
    status?: string;
    paid_at?: string | null;
    /** Motivo do estorno (T-06.13); nulo se não estornado. */
    void_reason?: string | null;
  }[];
}

export type TimelineKind = 'lodging' | 'consumption' | 'payment';

/**
 * Rótulo do consumo na conta e no comprovante: "3 × Caipirinha" quando há mais de uma unidade.
 * Sem a quantidade, 3 caipirinhas de R$ 22,00 apareciam como "Caipirinha R$ 66,00", e o hóspede
 * lia uma caipirinha de R$ 66,00 (QA de 24/11, 🟡-1). Uma unidade, ou servidor antigo sem
 * `quantity`, fica só com o nome, como antes. Mesmo "×" da comanda do garçom.
 */
export function consumptionLabel(c: { description?: string; quantity?: number }): string {
  const name = c.description || 'Consumo';
  return c.quantity && c.quantity > 1 ? `${c.quantity} × ${name}` : name;
}

export interface TimelineEntry {
  key: string;
  kind: TimelineKind;
  /** Instante para ordenar e exibir. null = pagamento sem data (vai para o fim). */
  at: Date | null;
  /** true para diária: a data é o dia, não a hora. */
  dateOnly: boolean;
  label: string;
  /** Débito positivo (diária, consumo); crédito negativo (pagamento). */
  amountCents: Cents;
  /**
   * Linha que não conta no saldo nem em cobranças: pagamento não confirmado (PIX pendente, falho,
   * expirado), pagamento estornado e consumo estornado.
   */
  notCounted: boolean;
  /**
   * Pagamento PENDING: ainda pode entrar e soma em "aguardando". EXPIRED e FAILED não abatem
   * e também não somam — é cobrança morta, igual ao `total_pending` do GetBillController.
   */
  awaiting: boolean;
  /**
   * Lançamento estornado pela gerência: pagamento VOIDED (T-06.13), com o motivo, ou consumo
   * excluído (CA-05.2.j), com quem autorizou. Não abate nem soma; a tela mostra riscado.
   */
  voided: boolean;
  /**
   * Linha que compõe o saldo apresentado ao hóspede: diárias, consumos, pagamentos PAID e PIX
   * ainda PENDING. EXPIRED, FAILED, VOIDED e consumo estornado ficam de fora do comprovante (ver
   * receiptEntries).
   */
  onReceipt: boolean;
  /** Saldo depois desta linha — só o que conta entra. */
  balanceCents: Cents;
}

export interface BillTimeline {
  entries: TimelineEntry[];
  chargesCents: Cents;
  paidCents: Cents;
  pendingCents: Cents;
  balanceCents: Cents;
}

const KIND_ORDER: Record<TimelineKind, number> = { lodging: 0, consumption: 1, payment: 2 };

export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  PIX: 'PIX',
  CREDIT_CARD: 'Cartão de crédito',
  DEBIT_CARD: 'Cartão de débito',
  CASH: 'Dinheiro',
  // Allowlist da API desde a T-06.13 (paymentEnums.PAYMENT_METHODS).
  CARTAO_CREDITO: 'Cartão de crédito',
  CARTAO_DEBITO: 'Cartão de débito',
  DINHEIRO: 'Dinheiro',
  // Linha antiga: `method` era TEXT livre e o seed usa 'CARTAO'.
  CARTAO: 'Cartão',
};

const PAYMENT_STATUS_NOTE: Record<string, string> = {
  PENDING: 'aguardando confirmação',
  EXPIRED: 'expirado',
  FAILED: 'falhou',
  VOIDED: 'estornado',
};

/** Número (como o /bill devolve) para centavos — via @hotel/domain, nunca aritmética de float. */
function cents(value: number | undefined): Cents {
  return value === undefined ? 0 : decimalToCents(value);
}

/**
 * Divide o total da hospedagem em uma linha por noite. O resto da divisão em centavos vai
 * para as primeiras noites (1 centavo cada), para a soma das linhas bater com o total.
 */
export function splitLodging(totalCents: Cents, nights: number): Cents[] {
  if (nights <= 0) return [];
  const base = Math.trunc(totalCents / nights);
  const rest = totalCents - base * nights;
  return Array.from({ length: nights }, (_, i) => base + (i < rest ? 1 : 0));
}

/**
 * Conta da reserva como linha do tempo: diárias (uma por noite), consumos e pagamentos em
 * ordem cronológica, com o saldo correndo. Só pagamento PAID abate — igual ao GetBillController.
 * Consumo estornado aparece para a equipe, mas não entra em cobranças nem no saldo (CA-05.2.j).
 */
export function buildBillTimeline(bill: BillLike): BillTimeline {
  const raw: Omit<TimelineEntry, 'balanceCents'>[] = [];

  const checkIn = bill.check_in_date;
  const nights = checkIn && bill.check_out_date ? (safeNights(checkIn, bill.check_out_date) ?? 0) : 0;
  const lodging = splitLodging(cents(bill.room_total), nights);
  lodging.forEach((amount, i) => {
    if (!checkIn || amount === 0) return;
    const day = addDaysISO(checkIn, i);
    raw.push({
      key: `lodging-${day}`,
      kind: 'lodging',
      at: parseHotelDate(day),
      dateOnly: true,
      label: `Diária ${i + 1} de ${nights}`,
      amountCents: amount,
      notCounted: false,
      awaiting: false,
      voided: false,
      onReceipt: true,
    });
  });

  for (const c of bill.consumptions ?? []) {
    raw.push({
      key: `consumption-${c.id}`,
      kind: 'consumption',
      at: c.consumed_at ? new Date(c.consumed_at) : null,
      dateOnly: false,
      label: consumptionLabel(c),
      amountCents: cents(c.amount),
      notCounted: false,
      awaiting: false,
      voided: false,
      onReceipt: true,
    });
  }

  // Fica na data em que foi lançado, onde a equipe procuraria o consumo. Fora do saldo e do
  // comprovante, como o pagamento estornado.
  for (const c of bill.voided_consumptions ?? []) {
    // Nome em branco é tão sem registro quanto nome ausente, como o motivo do pagamento estornado.
    const who = c.deleted_by?.name?.trim();
    const note = who ? `estornado por ${who}` : 'estornado, sem registro de quem autorizou';
    raw.push({
      key: `voided-consumption-${c.id}`,
      kind: 'consumption',
      at: c.consumed_at ? new Date(c.consumed_at) : null,
      dateOnly: false,
      label: `${consumptionLabel(c)} (${note})`,
      amountCents: cents(c.amount),
      notCounted: true,
      awaiting: false,
      voided: true,
      onReceipt: false,
    });
  }

  for (const p of bill.payments ?? []) {
    const method = p.method ? (PAYMENT_METHOD_LABEL[p.method] ?? p.method) : 'Pagamento';
    const voided = p.status === 'VOIDED';
    const reason = voided && p.void_reason?.trim() ? `: ${p.void_reason.trim()}` : '';
    // Status desconhecido aparece como "situação desconhecida", nunca como enum cru.
    const note =
      p.status && p.status !== 'PAID' ? `${PAYMENT_STATUS_NOTE[p.status] ?? 'situação desconhecida'}${reason}` : undefined;
    const kind = p.kind === 'DEPOSIT' ? 'Sinal' : 'Pagamento';
    raw.push({
      key: `payment-${p.id}`,
      kind: 'payment',
      at: p.paid_at ? new Date(p.paid_at) : null,
      dateOnly: false,
      label: `${kind} · ${method}${note ? ` (${note})` : ''}`,
      amountCents: -cents(p.amount),
      notCounted: p.status !== 'PAID',
      awaiting: p.status === 'PENDING',
      voided,
      onReceipt: p.status === 'PAID' || p.status === 'PENDING',
    });
  }

  raw.sort((a, b) => {
    const ta = a.at ? a.at.getTime() : Number.POSITIVE_INFINITY;
    const tb = b.at ? b.at.getTime() : Number.POSITIVE_INFINITY;
    if (ta !== tb) return ta - tb;
    return KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
  });

  let balance = 0;
  let charges = 0;
  let paid = 0;
  let pending = 0;
  const entries = raw.map((e) => {
    if (e.kind === 'payment') {
      if (e.awaiting) pending += -e.amountCents;
      else if (!e.notCounted) paid += -e.amountCents;
    } else if (!e.notCounted) {
      charges += e.amountCents;
    }
    if (!e.notCounted) balance += e.amountCents;
    return { ...e, balanceCents: balance };
  });

  return { entries, chargesCents: charges, paidCents: paid, pendingCents: pending, balanceCents: balance };
}

/**
 * Linhas do comprovante entregue ao hóspede: só o que compõe o saldo apresentado.
 *
 * Estorno (VOIDED) fica FORA, de propósito: é a anulação de um lançamento feito por engano pela
 * equipe — o hóspede não pagou aquele valor, e nada saiu nem entrou na gaveta. No papel, uma
 * linha "−R$ 200,00" riscada ainda lê como pagamento, e o hóspede somaria o que não pagou. O
 * mesmo vale para PIX expirado ou falho: cobrança morta. O histórico completo, com o motivo do
 * estorno, continua na aba Conta, que é da equipe. PIX ainda PENDING fica, rotulado
 * "aguardando confirmação", porque ainda pode entrar e aparece em "aguardando".
 */
export function receiptEntries(timeline: BillTimeline): TimelineEntry[] {
  return timeline.entries.filter((e) => e.onReceipt);
}

/** Saldo oficial: o do servidor quando existe; a soma local é só a demonstração linha a linha. */
export function officialBalanceCents(bill: BillLike): Cents {
  return bill.balance_due === undefined ? buildBillTimeline(bill).balanceCents : cents(bill.balance_due);
}

// ─── Filtro de período e paginação da lista (CA-05.2.a) ────────────────────────────────

export type PeriodPreset = 'today' | 'next7' | 'next30';

export const PERIOD_PRESETS: { id: PeriodPreset; label: string; days: number }[] = [
  { id: 'today', label: 'Hoje', days: 0 },
  { id: 'next7', label: 'Próximos 7 dias', days: 7 },
  { id: 'next30', label: 'Próximos 30 dias', days: 30 },
];

export function presetRange(preset: PeriodPreset, today: string): { from: string; to: string } {
  const days = PERIOD_PRESETS.find((p) => p.id === preset)?.days ?? 0;
  return { from: today, to: addDaysISO(today, days) };
}

export function pageCount(total: number, limit: number): number {
  return limit > 0 ? Math.max(1, Math.ceil(total / limit)) : 1;
}

// ─── 409 de corrida na criação ─────────────────────────────────────────────────────────

/**
 * Mensagem do balcão para o 409: nomeia o(s) quarto(s) que outro atendimento acabou de pegar.
 * null quando o servidor não disse quais (corrida barrada pelo EXCLUDE do banco) — aí vale a
 * mensagem genérica do RoomConflictError.
 */
export function roomConflictMessage(selected: { id?: string; number?: string }[], lostIds: string[]): string | null {
  const lost = new Set(lostIds);
  const numbers = selected.filter((r) => r.id && lost.has(r.id)).map((r) => r.number ?? '?');
  if (numbers.length === 0) return null;
  const which = numbers.length === 1 ? `o quarto ${numbers[0]}` : `os quartos ${numbers.join(', ')}`;
  return `Outro atendimento acabou de reservar ${which} neste período. Escolha outro quarto livre.`;
}

// ─── Minimização no papel (LGPD art. 6º, III) ──────────────────────────────────────────

/**
 * CPF mascarado para o comprovante impresso: `***.456.789-**`. O papel serve para o hóspede
 * conferir a conta; os seis dígitos do meio bastam para ele reconhecer o próprio documento, e
 * o número inteiro não tem finalidade num documento sem valor fiscal. Fora do formato de CPF
 * (11 dígitos), não mostra nada — melhor omitir que vazar um documento que não sabemos ler.
 */
export function maskCpf(cpf: string | null | undefined): string | null {
  const digits = (cpf ?? '').replace(/\D/g, '');
  if (digits.length !== 11) return null;
  return `***.${digits.slice(3, 6)}.${digits.slice(6, 9)}-**`;
}

// ─── Cadastro rápido de hóspede a partir da busca (CA-05.2.l) ──────────────────────────

export interface GuestDraft {
  full_name: string;
  cpf: string;
  phone: string;
  email: string;
}

const CPF_MASK = /^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/;

/**
 * O que o recepcionista já digitou na busca vira o campo certo do cadastro — ele não
 * redigita o CPF que acabou de informar. Heurística simples e previsível:
 * e-mail tem @; CPF tem a máscara (ou 11 dígitos sem parênteses); outro número é telefone;
 * o resto é nome.
 */
export function guestDraftFromTerm(term: string): GuestDraft {
  const draft: GuestDraft = { full_name: '', cpf: '', phone: '', email: '' };
  const t = term.trim();
  if (!t) return draft;
  if (t.includes('@')) return { ...draft, email: t };
  const digits = t.replace(/\D/g, '');
  if (CPF_MASK.test(t) && !t.includes('(')) return { ...draft, cpf: t };
  if (digits.length >= 8 && digits.length >= t.replace(/\s/g, '').length - 4) return { ...draft, phone: t };
  return { ...draft, full_name: t };
}

/** As abas do detalhe da reserva, na ordem da tela. */
export const RESERVATION_TABS = ['resumo', 'conta'] as const;
export type ReservationTab = (typeof RESERVATION_TABS)[number];

/**
 * Aba seguinte pelo teclado, no padrão de abas da W3C (decisão de 15/11, SPEC-08 §9): setas andam em
 * círculo, Home vai para a primeira, End para a última. Outra tecla devolve null e não troca nada.
 */
export function nextTab(current: ReservationTab, key: string): ReservationTab | null {
  const n = RESERVATION_TABS.length;
  const i = RESERVATION_TABS.indexOf(current);
  const alvo =
    key === 'ArrowRight' ? (i + 1) % n
    : key === 'ArrowLeft' ? (i - 1 + n) % n
    : key === 'Home' ? 0
    : key === 'End' ? n - 1
    : -1;
  return RESERVATION_TABS[alvo] ?? null;
}

/**
 * Ação principal da reserva (T-08.3, GUIA_UI_CORPORATIVA regra 1): a que é possível agora — check-in,
 * senão check-out. Ela vai para o cabeçalho em primary; as demais ficam secundárias, com o motivo.
 * Cancelar nunca é a principal, mesmo quando é a única ação possível (SPEC-08 §5).
 */
export function primaryAction(
  actions: ReservationActions,
  { paymentDue = false }: { paymentDue?: boolean } = {},
): 'check-in' | 'check-out' | null {
  if (actions.checkIn.enabled) return 'check-in';
  // Com saldo a receber, a ação do balcão é o pagamento (o PaymentForm da aba Conta): o check-out
  // desce para secondary e volta a principal quando o saldo zera — paga, depois sai (decisão do
  // Sirlande de 16/11, repasse do qa-explorador; CA-08.e).
  if (actions.checkOut.enabled && !paymentDue) return 'check-out';
  return null;
}
