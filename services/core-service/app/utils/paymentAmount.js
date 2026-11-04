import { toCents } from './calculateStayTotal.js';

// Teto de payments.amount, NUMERIC(12,2): acima disso o banco estoura e viraria 500.
const MAX_CENTS = 999_999_999_999;

/**
 * O valor de um pagamento é válido? Positivo, com até 2 casas e dentro da coluna (D-49).
 * toCents devolve 0 para negativo, zero ou texto inválido.
 */
export function isValidPaymentAmount(amount) {
    const cents = toCents(amount);
    return cents > 0 && cents <= MAX_CENTS;
}

export const INVALID_AMOUNT_MESSAGE = 'amount deve ser um valor positivo com até 2 casas decimais.';
