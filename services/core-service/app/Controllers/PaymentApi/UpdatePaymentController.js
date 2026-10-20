import sequelize from '../../../database/connections/sequelize.js';
import PaymentModel from '../../Models/PaymentModel.js';
import { settlePaymentAccount } from '../../utils/accountBill.js';
import { isValidPaymentAmount, INVALID_AMOUNT_MESSAGE } from '../../utils/paymentAmount.js';

/**
 * PUT /payments/:id
 * Altera valor, método ou data. Reserva e conta do pagamento não mudam.
 * Mudar o valor pode quitar a conta ou reabrir o saldo dela: acerta CLOSED ↔ PAID na
 * mesma transação (T-04.4).
 */
export default async function UpdatePaymentController(request, response) {
    try {
        const { amount, method, paid_at } = request.body;
        // Mesma regra do POST (D-49).
        if (amount !== undefined && !isValidPaymentAmount(amount)) {
            return response.status(400).json({ error: INVALID_AMOUNT_MESSAGE });
        }

        const transaction = await sequelize.transaction();
        try {
            const payment = await PaymentModel.findOne({
                where: { id: request.params.id, tenant_id: request.user.tenantId },
                transaction
            });

            if (!payment) {
                await transaction.rollback();
                return response.status(404).json({ error: 'Pagamento não encontrado.' });
            }

            await payment.update({ amount, method, paid_at }, { transaction });
            await settlePaymentAccount(payment, transaction);
            await transaction.commit();

            return response.json(payment);
        } catch (error) {
            await transaction.rollback();
            throw error;
        }
    } catch (error) {
        console.error('UpdatePaymentController error:', error);
        return response.status(500).json({ error: 'Erro ao atualizar pagamento.' });
    }
}
