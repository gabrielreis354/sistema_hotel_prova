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

/**
 * Data de pagamento: texto ISO-8601 que o JavaScript entende, com ano de 4 dígitos.
 * Nulo, vazio, número e objeto são recusados — em pagamento PAID a data é obrigatória
 * (CHECK payments_paid_has_paid_at), e é ela que põe o pagamento no mês da receita.
 */
export function isValidPaidAt(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(value.trim())) return false;
    return !Number.isNaN(Date.parse(value));
}
