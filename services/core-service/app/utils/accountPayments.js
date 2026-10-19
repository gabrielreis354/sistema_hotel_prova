import sequelize from '../../database/connections/sequelize.js';
import { toCents } from './calculateStayTotal.js';

/**
 * Conta titular da reserva (T-04.4, decisão 1): a conta de diária mais antiga, sem as
 * excluídas. É ela que recebe os pagamentos feitos na reserva sem conta — o sinal PIX e o
 * pagamento da recepção pela reserva —, como o depósito que um PMS transfere para o folio
 * principal. "Mais antiga" não muda com a troca de quarto: o pagamento não pula de conta.
 * Mesmo desempate (opened_at, id) da sobra de centavos da diária (lodgingShare).
 *
 * @returns {Promise<string|null>} id da conta, ou null se a reserva não tem conta de diária
 */
export async function titularAccountId(reservationId, tenantId, transaction) {
    const [[row]] = await sequelize.query(`
        SELECT id FROM accounts
         WHERE reservation_id = :reservationId AND tenant_id = :tenantId
           AND charges_lodging = true AND deleted_at IS NULL
         ORDER BY opened_at ASC, id ASC
         LIMIT 1`,
    { replacements: { reservationId, tenantId }, transaction });
    return row?.id ?? null;
}

/**
 * Quanto foi pago nesta conta, em centavos (CA-04.4.c): os pagamentos dela e, se for a
 * titular, os da reserva sem conta. Só PAID conta — cobrança PIX PENDING, FAILED ou
 * EXPIRED ainda não pagou nada —, e pagamento excluído não conta.
 *
 * Soma no banco, em NUMERIC, devolvida como texto: somar dinheiro em float erra centavo.
 *
 * @param {import('sequelize').Model} account
 * @param {import('sequelize').Transaction} [transaction]
 * @returns {Promise<number>}
 */
export async function paymentsMadeCents(account, transaction) {
    const titular = Boolean(account.reservation_id) && account.charges_lodging
        && (await titularAccountId(account.reservation_id, account.tenant_id, transaction)) === account.id;

    const [[{ total }]] = await sequelize.query(`
        SELECT COALESCE(SUM(amount), 0)::text AS total
          FROM payments
         WHERE tenant_id = :tenantId AND status = 'PAID' AND deleted_at IS NULL
           AND (account_id = :accountId
                OR (:titular AND account_id IS NULL AND reservation_id = :reservationId))`,
    {
        replacements: {
            tenantId: account.tenant_id, accountId: account.id, titular, reservationId: account.reservation_id
        },
        transaction
    });
    return toCents(total);
}
