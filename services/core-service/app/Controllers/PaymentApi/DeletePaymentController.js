import sequelize from '../../../database/connections/sequelize.js';
import PaymentModel from '../../Models/PaymentModel.js';
import { settlePaymentAccount } from '../../utils/accountBill.js';

/**
 * DELETE /payments/:id
 * Exclusão lógica. Sem o pagamento, a conta que ele quitava volta a CLOSED com saldo —
 * acertado na mesma transação (T-04.4).
 */
export default async function DeletePaymentController(request, response) {
    try {
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

            await payment.destroy({ transaction });
            await settlePaymentAccount(payment, transaction);
            await transaction.commit();

            return response.status(204).send();
        } catch (error) {
            await transaction.rollback();
            throw error;
        }
    } catch (error) {
        console.error('DeletePaymentController error:', error);
        return response.status(500).json({ error: 'Erro ao remover pagamento.' });
    }
}
