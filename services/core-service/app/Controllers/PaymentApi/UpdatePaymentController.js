import sequelize from '../../../database/connections/sequelize.js';
import PaymentModel from '../../Models/PaymentModel.js';
import isUuid from '../../utils/isUuid.js';
import { toCents } from '../../utils/calculateStayTotal.js';
import { isValidPaymentAmount, INVALID_AMOUNT_MESSAGE } from '../../utils/paymentAmount.js';
import { EDITABLE_STATUSES } from '../../utils/paymentEnums.js';

/**
 * PUT /payments/:id
 * Corrige método ou data de um lançamento manual. Só ADMIN, pela rota (repasse de 19/10).
 *
 * O valor de um pagamento não se altera (T-06.13): corrigir valor é estornar
 * (POST /payments/:id/void, com motivo) e lançar de novo — o lançamento errado fica no
 * histórico. `amount` só é aceito igual ao gravado (cliente que reenvia o objeto inteiro).
 * Como valor, reserva e conta não mudam, o saldo das contas também não: não há acerto.
 *
 * Allowlist: só PAID se corrige. VOIDED é histórico; PENDING, EXPIRED e FAILED, e todo
 * pagamento de PSP, são do provedor — 409. Status e trilha de estorno nunca vêm do corpo.
 */
export default async function UpdatePaymentController(request, response) {
    try {
        const { amount, method, paid_at } = request.body;
        const tenantId = request.user.tenantId;
        // Mesma regra do POST (D-49).
        if (amount !== undefined && !isValidPaymentAmount(amount)) {
            return response.status(400).json({ error: INVALID_AMOUNT_MESSAGE });
        }
        if (!isUuid(request.params.id)) return response.status(404).json({ error: 'Pagamento não encontrado.' });

        const transaction = await sequelize.transaction();
        try {
            const refuse = async (status, error) => {
                await transaction.rollback();
                return response.status(status).json({ error });
            };

            // Trava contra um estorno simultâneo. unscoped: provider diz se é de PSP.
            const payment = await PaymentModel.unscoped().findOne({
                where: { id: request.params.id, tenant_id: tenantId },
                lock: transaction.LOCK.UPDATE,
                transaction
            });
            if (!payment) return refuse(404, 'Pagamento não encontrado.');
            if (!EDITABLE_STATUSES.includes(payment.status) || payment.provider) {
                return refuse(409, `Pagamento ${payment.status}${payment.provider ? ' do PSP' : ''} não se altera.`);
            }
            if (amount !== undefined && toCents(amount) !== toCents(payment.amount)) {
                return refuse(409, 'O valor de um pagamento não se altera: estorne (POST /payments/:id/void) e lance de novo.');
            }

            await PaymentModel.update({ method, paid_at }, { where: { id: payment.id, tenant_id: tenantId }, transaction });
            const updated = await PaymentModel.findOne({ where: { id: payment.id, tenant_id: tenantId }, transaction });
            await transaction.commit();

            return response.json(updated);
        } catch (error) {
            await transaction.rollback();
            throw error;
        }
    } catch (error) {
        console.error('UpdatePaymentController error:', error.message);
        return response.status(500).json({ error: 'Erro ao atualizar pagamento.' });
    }
}
