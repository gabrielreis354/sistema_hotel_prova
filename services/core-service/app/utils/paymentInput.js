import { PAYMENT_METHODS } from './paymentEnums.js';

/**
 * Validação de entrada de POST e PUT /payments (ressalvas 🟡-1 e 🟢-1 do qa-redteam da
 * T-06.13). Dado inválido responde 400 aqui, em vez de chegar ao banco e virar 500 — ou,
 * pior, ser gravado: um método fora da lista entrava no payment-mix, e um paid_at nulo
 * tirava da receita um pagamento PAID sem estorno.
 */

export const INVALID_METHOD_MESSAGE = `method deve ser um de: ${PAYMENT_METHODS.join(', ')}.`;
export const INVALID_PAID_AT_MESSAGE = 'paid_at deve ser uma data válida (ISO-8601, ex.: 2026-10-21T14:00:00Z).';

export function isValidPaymentMethod(method) {
    return PAYMENT_METHODS.includes(method);
}

const ISO_DATE_PREFIX = /^(\d{4})-(\d{2})-(\d{2})/;

/**
 * Data de pagamento: texto ISO-8601 que o JavaScript entende, com ano de 4 dígitos.
 * Nulo, vazio, número e objeto são recusados — em pagamento PAID a data é obrigatória
 * (CHECK payments_paid_has_paid_at), e é ela que põe o pagamento no mês da receita.
 *
 * O dia precisa existir no calendário (reauditoria delta, 🟢-1): Date.parse normaliza
 * "31/04" para 01/05 em vez de recusar, e o pagamento mudava de mês na receita sem aviso.
 * A conferência é sobre ano, mês e dia do próprio texto, não sobre a data interpretada —
 * assim o fuso do texto não interfere. Ano 0000 é recusado: o Postgres não o aceita (500).
 */
export function isValidPaidAt(value) {
    if (typeof value !== 'string') return false;
    const match = ISO_DATE_PREFIX.exec(value.trim());
    if (!match || Number.isNaN(Date.parse(value))) return false;

    const [year, month, day] = match.slice(1).map(Number);
    if (year < 1 || month < 1 || month > 12 || day < 1) return false;
    // Dia 0 do mês seguinte = último dia deste mês (UTC, sem fuso). setUTCFullYear, não
    // Date.UTC: este trata o ano 0-99 como 1900+.
    const lastDay = new Date(0);
    lastDay.setUTCFullYear(year, month, 0);
    return day <= lastDay.getUTCDate();
}
