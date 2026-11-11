import { centsToDecimalString, formatBRL, parseBRLInput, type Cents } from '@hotel/domain';
import type { PaymentInput } from './reservationsApi.js';

/**
 * Regras do pagamento registrado no check-out (M5-b, CA-05.6.a). Puras, para o teste prender
 * cada decisão sem montar a tela.
 */

export type PaymentMethod = PaymentInput['method'];

// Ordem do balcão: o que mais se recebe primeiro.
export const PAYMENT_METHOD_OPTIONS: { id: PaymentMethod; label: string }[] = [
  { id: 'PIX', label: 'PIX' },
  { id: 'CARTAO_DEBITO', label: 'Cartão de débito' },
  { id: 'CARTAO_CREDITO', label: 'Cartão de crédito' },
  { id: 'DINHEIRO', label: 'Dinheiro' },
];

// Allowlists (fail-safe, CLAUDE.md §7): status ou papel novo nasce sem o formulário.
// D2: hospedado ou já saído. O sinal de reserva futura (PENDING/CONFIRMED) fica fora do M5-b.
const RECEIVING_STATUSES = ['CHECKED_IN', 'CHECKED_OUT'];
// O garçom já é barrado no servidor (allowlist do WAITER, CA-04.1.n); aqui ele só não vê.
const RECEIVING_ROLES = ['ADMIN', 'RECEPTIONIST'];

export function canReceivePayment({
  status,
  balanceCents,
  role,
  billFailed = false,
}: {
  status: string | undefined;
  balanceCents: Cents | null;
  role: string | undefined;
  /**
   * A última recarga da conta falhou. O saldo na tela é o de antes — talvez de antes de um
   * pagamento que gravou sem resposta. Formulário fora até a conta voltar (🟡-3 do qa-redteam).
   */
  billFailed?: boolean;
}): boolean {
  return (
    !billFailed &&
    balanceCents !== null &&
    balanceCents > 0 &&
    RECEIVING_STATUSES.includes(status ?? '') &&
    RECEIVING_ROLES.includes(role ?? '')
  );
}

// Teto de payments.amount, NUMERIC(12,2) — o mesmo do backend (paymentAmount.js).
const MAX_CENTS = 999_999_999_999;

export type AmountReading =
  | { ok: true; cents: Cents; overpaidCents: Cents }
  | { ok: false; error: string };

/**
 * Lê o valor digitado. Parcial é livre; a maior passa, com o quanto sobra a devolver, para a
 * tela pedir confirmação (D3) — o backend aceita e deixa o saldo negativo (D-44).
 */
export function readPaymentAmount(text: string, balanceCents: Cents): AmountReading {
  const cents = parseBRLInput(text);
  if (cents === null) return { ok: false, error: 'Digite o valor recebido, por exemplo 150,00.' };
  if (cents <= 0) return { ok: false, error: 'O valor precisa ser maior que zero.' };
  if (cents > MAX_CENTS) return { ok: false, error: 'Valor acima do limite aceito. Confira o valor recebido.' };
  return { ok: true, cents, overpaidCents: Math.max(0, cents - balanceCents) };
}

/**
 * Corpo do POST /payments. Pela reserva (D1): o saldo da tela é o da estadia, e o servidor
 * reparte o crédito entre as contas dela (D-42, D-45). Valor em texto (D5). Sem paid_at: o
 * servidor grava a hora do registro.
 */
export function paymentBody(reservationId: string, cents: Cents, method: PaymentMethod): PaymentInput {
  return { reservation_id: reservationId, amount: centsToDecimalString(cents), method };
}

export type SubmitStep =
  | { kind: 'error'; error: string }
  | { kind: 'confirm'; overpaidCents: Cents }
  | { kind: 'send'; cents: Cents }
  | { kind: 'wait' };

/**
 * O que o envio do formulário faz. Com a confirmação do "a maior" aberta, o Enter no campo
 * também submete o form (regra do HTML com um só campo de texto) — e não pode gravar: só o
 * botão "Sim, registrar" grava (🟡-1 do qa-redteam).
 */
export function submitStep({
  reading,
  method,
  confirming,
}: {
  reading: AmountReading;
  method: PaymentMethod | null;
  confirming: boolean;
}): SubmitStep {
  if (confirming) return { kind: 'wait' };
  if (!reading.ok) return { kind: 'error', error: reading.error };
  if (!method) return { kind: 'error', error: 'Escolha como o hóspede pagou.' };
  if (reading.overpaidCents > 0) return { kind: 'confirm', overpaidCents: reading.overpaidCents };
  return { kind: 'send', cents: reading.cents };
}

export type FreshBalance = { ok: true; balanceCents: Cents } | { ok: false };

export type FreshBalanceStep = { kind: 'send' } | { kind: 'stop'; text: string };

/**
 * O saldo conferido no servidor logo antes de gravar (P-8). O "a maior" é decidido com o saldo
 * da tela, e o cache não recarrega quando a aba volta ao foco: se outro balcão registrou um
 * pagamento no meio, a tela gravaria a maior sem a confirmação da P-3 (🔴 do qa-explorador de
 * 11/11). Qualquer diferença para: a tela se refaz com o saldo novo e a recepção decide de novo.
 * Sem conseguir conferir, também para (fail-safe): nada foi enviado ao POST /payments, e o
 * formulário continua na tela para tentar de novo.
 */
export function freshBalanceStep({ shownCents, fresh }: { shownCents: Cents; fresh: FreshBalance }): FreshBalanceStep {
  if (!fresh.ok) {
    return {
      kind: 'stop',
      text: 'Não foi possível conferir o saldo da conta. Nada foi registrado. Tente de novo.',
    };
  }
  const now = fresh.balanceCents;
  if (now === shownCents) return { kind: 'send' };
  if (now === 0) return { kind: 'stop', text: 'A conta já foi quitada em outro registro. Nada foi registrado.' };
  if (now < 0) {
    return {
      kind: 'stop',
      text: `A conta já tem ${formatBRL(-now)} a devolver por outro registro. Nada foi registrado.`,
    };
  }
  return {
    kind: 'stop',
    text: `O saldo mudou para ${formatBRL(now)}: outro pagamento ou consumo entrou nesta conta. Nada foi registrado. Confira o valor e registre de novo.`,
  };
}

/**
 * A sequência do envio: conferir o saldo e só então gravar (P-8). Fora do componente para o
 * teste prender a ordem: o `send` nunca sai antes da resposta da conferência.
 * - `readFresh` lançou (rede, 5xx): para, como saldo não conferido.
 * - O formulário saiu da tela durante a conferência: não grava, mesmo com o saldo igual. Uma
 *   instância nova do formulário pode estar enviando o mesmo pagamento (🟡-1 do qa-redteam de
 *   11/11). O aviso de parada ainda sobe: ele vai para a página, não para o formulário.
 */
export async function confirmBalanceThenSend({
  shownCents,
  readFresh,
  isMounted,
  send,
  stop,
}: {
  shownCents: Cents;
  readFresh: () => Promise<Cents>;
  isMounted: () => boolean;
  send: () => void;
  stop: (text: string) => void;
}): Promise<void> {
  let fresh: FreshBalance;
  try {
    fresh = { ok: true, balanceCents: await readFresh() };
  } catch {
    fresh = { ok: false };
  }
  const step = freshBalanceStep({ shownCents, fresh });
  if (step.kind === 'stop') return stop(step.text);
  if (isMounted()) send();
}
