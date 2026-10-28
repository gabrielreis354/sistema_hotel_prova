import { decimalToCents, formatBRL, multiplyCents, sumCents, type Cents } from '@hotel/domain';
import type { AccountBill } from './accountsApi.js';
import { pendingFor, type QueueEntry } from './queueCore.js';

/** O mínimo de um item de conta que a tela precisa (subconjunto de AccountItem). */
export interface ItemLike {
  description?: string;
  quantity?: number;
  total?: string;
  billable?: boolean;
  reason?: string | null;
}

const REASON_LABEL: Record<string, string> = {
  COURTESY: 'Cortesia',
  STAFF: 'Funcionário',
  LOSS: 'Perda',
  INTERNAL_USE: 'Uso interno',
};

/** Soma dos itens faturáveis. Cortesia mantém o valor gravado, mas soma zero (RN-007, CA-05.5.h). */
export function billableCents(items: ItemLike[]): Cents {
  return sumCents(items.filter((i) => i.billable !== false).map((i) => decimalToCents(i.total ?? '0')));
}

/** Como um item aparece na lista: quantidade só se ≠ 1 (CA-05.5.c); cortesia riscada e com rótulo. */
export function itemLine(item: ItemLike) {
  const priceCents = decimalToCents(item.total ?? '0');
  const struck = item.billable === false;
  return {
    priceCents,
    struck,
    label: struck ? (REASON_LABEL[item.reason ?? ''] ?? 'Não cobrado') : null,
    countedCents: struck ? 0 : priceCents,
    quantityLabel: item.quantity && item.quantity !== 1 ? `${item.quantity}×` : null,
  };
}

/**
 * Rodapé da conta: o total do servidor mais o que ainda está na fila deste aparelho. A parte da
 * fila vem separada, para a tela dizer "inclui R$ X na fila" — nunca fingir que já gravou.
 */
export function footerTotals(serverTotal: string, entries: QueueEntry[], accountId: string) {
  const serverCents = decimalToCents(serverTotal);
  const pendingCents = sumCents(
    pendingFor(entries, accountId).map((e) => multiplyCents(decimalToCents(e.unitPrice), e.quantity)),
  );
  return { serverCents, pendingCents, totalCents: serverCents + pendingCents };
}

/** Texto do botão: numa linha com 2× ou mais, desfazer tira só um, e o botão diz isso. */
export function undoLabel(quantity: number): string {
  return quantity > 1 ? 'Desfazer 1' : 'Desfazer';
}

/**
 * Aviso depois de fechar: o saldo, não o total (🟡-1 do qa-redteam). Com pagamento parcial, o
 * total da confirmação não é o que falta cobrar. Saldo negativo é crédito, sem sinal de menos.
 */
export function closedNotice(label: string, bill: Partial<AccountBill> | undefined): string {
  if (!bill?.balance) return `${label} fechada.`;
  const cents = decimalToCents(bill.balance);
  if (cents > 0) return `${label} fechada. Saldo a receber: ${formatBRL(cents)}.`;
  if (cents < 0) return `${label} fechada. Crédito do hóspede: ${formatBRL(-cents)}.`;
  return `${label} fechada. Nada a receber.`;
}
