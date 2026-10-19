import sequelize from '../../../database/connections/sequelize.js';
import PaymentModel from '../../Models/PaymentModel.js';
import ReservationModel from '../../Models/ReservationModel.js';
import AccountModel from '../../Models/AccountModel.js';
import isUuid from '../../utils/isUuid.js';
import { settlePaymentAccount } from '../../utils/accountBill.js';
import pendingLegacyConsumption from '../../utils/pendingLegacyConsumption.js';

/**
 * POST /payments
 * Registra um pagamento da reserva ou de uma conta (T-04.4, CA-04.4.a).
 *
 * - Só `reservation_id`: contrato de sempre. Entra no saldo da conta titular (decisão 1).
 * - `account_id`: paga a conta. Na conta da suíte, `reservation_id` vem da conta — se o
 *   cliente mandar outro, 422. Conta INTERNAL (nunca é receita, RN-006) e conta PAID não
 *   recebem pagamento. Pagamento a maior é aceito: o saldo fica negativo (decisão 3).
 *
 * Na mesma transação, a conta afetada é acertada (CLOSED ↔ PAID).
 */
export default async function CreatePaymentController(request, response) {
    try {
        const { reservation_id, account_id, amount, method, paid_at } = request.body;
        const tenantId = request.user.tenantId;

        if ((!reservation_id && !account_id) || !amount || !method) {
            return response.status(400).json({ error: 'Campos obrigatórios: reservation_id ou account_id, amount, method.' });
        }
        // :id não-UUID chega ao Postgres como cast inválido e viraria 500.
        if (account_id && !isUuid(account_id)) return response.status(404).json({ error: 'Conta não encontrada.' });

        const transaction = await sequelize.transaction();
        try {
            let reservationId = reservation_id ?? null;

            if (account_id) {
                // Trava a conta: um fechamento ou outro pagamento simultâneo acertam em ordem.
                const account = await AccountModel.findOne({
                    where: { id: account_id, tenant_id: tenantId },
                    lock: transaction.LOCK.UPDATE,
                    transaction
                });
                const refuse = async (status, error) => {
                    await transaction.rollback();
                    return response.status(status).json({ error });
                };
                if (!account) return refuse(404, 'Conta não encontrada.');
                if (account.type === 'INTERNAL') return refuse(422, 'Conta INTERNAL não recebe pagamento: consumo interno nunca é receita.');
                if (account.status === 'PAID') return refuse(422, 'Conta PAID já está quitada.');
                if (reservation_id && reservation_id !== account.reservation_id) {
                    return refuse(422, 'reservation_id não é a reserva desta conta.');
                }
                // Consumo antigo fora da conta: o saldo sairia menor (D-31).
                if (account.reservation_id && await pendingLegacyConsumption(account.reservation_id, transaction)) {
                    return refuse(503, 'Consumos desta reserva em migração — conta temporariamente indisponível');
                }
                reservationId = account.reservation_id;
            } else {
                // Valida que a reserva pertence ao tenant
                const reservation = await ReservationModel.findOne({
                    where: { id: reservation_id, tenant_id: tenantId },
                    transaction
                });
                if (!reservation) {
                    await transaction.rollback();
                    return response.status(404).json({ error: 'Reserva não encontrada.' });
                }
            }

            const payment = await PaymentModel.create({
                tenant_id: tenantId,
                reservation_id: reservationId,
                account_id: account_id ?? null,
                amount,
                method,
                paid_at: paid_at ?? new Date()
            }, { transaction });

            await settlePaymentAccount(payment, transaction);
            await transaction.commit();
            return response.status(201).json(payment);
        } catch (error) {
            await transaction.rollback();
            throw error;
        }
    } catch (error) {
        console.error('CreatePaymentController error:', error);
        return response.status(500).json({ error: 'Erro ao registrar pagamento.' });
    }
}
