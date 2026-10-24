/**
 * Lógica pura da recepção de reservas — sem React, sem rede, testada em reservationLogic.test.ts.
 * Dinheiro sempre em centavos inteiros e datas sempre pelo @hotel/domain.
 */
import {
  addDaysISO,
  canCancelReservation,
  canCheckIn,
  canCheckOut,
  decimalToCents,
  multiplyCents,
  nightsBetween,
  parseHotelDate,
  RESERVATION_STATUSES,
  sumCents,
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

const CHECK_IN_BLOCKED: Partial<Record<ReservationStatus, string>> = {
  PENDING: 'Reserva pendente de confirmação: o check-in libera quando ela for confirmada.',
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

/**
 * Quais ações a recepção pode fazer agora. A decisão vem da allowlist de @hotel/domain
 * (fail-safe: status desconhecido desabilita tudo); este arquivo só acrescenta o motivo.
 */
export function reservationActions(status: string | undefined): ReservationActions {
  const known = isReservationStatus(status) ? status : undefined;
  if (!known) {
    const off = { enabled: false, reason: UNKNOWN_STATUS };
    return { checkIn: off, checkOut: off, cancel: off };
  }
  return {
    checkIn: action(canCheckIn(known), CHECK_IN_BLOCKED[known]),
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
  consumptions?: { id?: string; description?: string; amount?: number; consumed_at?: string }[];
  payments?: {
    id?: string;
    amount?: number;
    method?: string;
    kind?: string;
    status?: string;
    paid_at?: string | null;
  }[];
}

export type TimelineKind = 'lodging' | 'consumption' | 'payment';

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
  /** Pagamento que ainda não conta no saldo (PIX pendente, falho, expirado). */
  notCounted: boolean;
  /**
   * Pagamento PENDING: ainda pode entrar e soma em "aguardando". EXPIRED e FAILED não abatem
   * e também não somam — é cobrança morta, igual ao `total_pending` do GetBillController.
   */
  awaiting: boolean;
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
  // `method` é TEXT livre no PaymentModel; o seed e lançamentos antigos usam o nome em português.
  CARTAO: 'Cartão',
  DINHEIRO: 'Dinheiro',
};

const PAYMENT_STATUS_NOTE: Record<string, string> = {
  PENDING: 'aguardando confirmação',
  EXPIRED: 'expirado',
  FAILED: 'falhou',
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
    });
  });

  for (const c of bill.consumptions ?? []) {
    raw.push({
      key: `consumption-${c.id}`,
      kind: 'consumption',
      at: c.consumed_at ? new Date(c.consumed_at) : null,
      dateOnly: false,
      label: c.description || 'Consumo',
      amountCents: cents(c.amount),
      notCounted: false,
      awaiting: false,
    });
  }

  for (const p of bill.payments ?? []) {
    const method = p.method ? (PAYMENT_METHOD_LABEL[p.method] ?? p.method) : 'Pagamento';
    const note = p.status && p.status !== 'PAID' ? PAYMENT_STATUS_NOTE[p.status] ?? p.status : undefined;
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
    } else {
      charges += e.amountCents;
    }
    if (!e.notCounted) balance += e.amountCents;
    return { ...e, balanceCents: balance };
  });

  return { entries, chargesCents: charges, paidCents: paid, pendingCents: pending, balanceCents: balance };
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
