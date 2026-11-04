import sequelize from '../../../database/connections/sequelize.js';
import PaymentModel from '../../Models/PaymentModel.js';
import isUuid from '../../utils/isUuid.js';
import { settlePaymentAccount } from '../../utils/accountBill.js';
import { VOIDABLE_STATUSES, VOID_REASON_MAX_LENGTH } from '../../utils/paymentEnums.js';

/**
 * POST /payments/:id/void — estorno do lançamento (T-06.13, CA-06.13.b a h).
 *
 * Lançamento financeiro não se apaga — se estorna (D-2 do catálogo de eventos). Corrige um
 * pagamento feito por engano: valor errado, reserva errada, duplicado. O pagamento fica, com
 * status VOIDED, motivo, autor (do JWT) e horário; sai da receita e do saldo das contas, que
 * só somam PAID.
 *
 * - Só ADMIN, pela rota (CA-06.13.d): anular lançamento é decisão de gerência.
 * - Motivo obrigatório: texto não vazio, até VOID_REASON_MAX_LENGTH (400 sem ele).
 * - Allowlist (CA-06.13.c): só PAID vira VOIDED. VOIDED de novo → 409. Pagamento de PSP
 *   (provider preenchido) → 409: o dinheiro de fato entrou, e tirá-lo da receita exige
 *   devolução pelo PSP (REFUNDED, fora desta tarefa).
 * - A conta que o pagamento quitava volta a CLOSED com saldo na mesma transação (T-04.4).
 *
 * Ordem de trava: pagamento → reserva → contas, a mesma do webhook PIX. A trava do
 * pagamento serializa dois estornos simultâneos: o segundo lê VOIDED e recebe 409.
 */
export default async function VoidPaymentController(request, response) {
    try {
        const tenantId = request.user.tenantId;
        const { id } = request.params;
        const reason = typeof request.body?.reason === 'string' ? request.body.reason.trim() : '';

        if (!isUuid(id)) return response.status(404).json({ error: 'Pagamento não encontrado.' });
        if (!reason) return response.status(400).json({ error: 'reason obrigatório: diga por que o pagamento está sendo estornado.' });
        if (reason.length > VOID_REASON_MAX_LENGTH) {
            return response.status(400).json({ error: `reason deve ter até ${VOID_REASON_MAX_LENGTH} caracteres.` });
        }

        const transaction = await sequelize.transaction();
        try {
            const refuse = async (status, error) => {
                await transaction.rollback();
                return response.status(status).json({ error });
            };

            // unscoped: o defaultScope esconde provider, e é ele que diz se o pagamento é de PSP.
            const payment = await PaymentModel.unscoped().findOne({
                where: { id, tenant_id: tenantId },
                lock: transaction.LOCK.UPDATE,
                transaction
            });
            if (!payment) return refuse(404, 'Pagamento não encontrado.');
            if (!VOIDABLE_STATUSES.includes(payment.status)) {
                return refuse(409, `Pagamento ${payment.status} não pode ser estornado: só PAID vira VOIDED.`);
            }
            if (payment.provider) {
                return refuse(409, 'Pagamento recebido pelo PSP (PIX online) não se estorna aqui: exige devolução pelo PSP.');
            }

            // Relógio do banco, como no fechamento de conta: o horário do estorno é auditoria.
            const [[{ voidedAt }]] = await sequelize.query('SELECT clock_timestamp() AS "voidedAt"', { transaction });
            const [updated] = await PaymentModel.update(
                { status: 'VOIDED', void_reason: reason, voided_by: request.user.userId, voided_at: voidedAt },
                { where: { id, tenant_id: tenantId, status: payment.status }, transaction }
            );
            if (updated !== 1) throw new Error(`VoidPaymentController: o pagamento ${id} mudou de status no meio do estorno`);

            await settlePaymentAccount(payment, transaction);

            // Releitura pelo defaultScope: a resposta nunca leva pix_qr_code nem provider_charge_id.
            const voided = await PaymentModel.findOne({ where: { id, tenant_id: tenantId }, transaction });
            await transaction.commit();
            return response.status(200).json(voided);
        } catch (error) {
            await transaction.rollback();
            throw error;
        }
    } catch (error) {
        console.error('VoidPaymentController error:', error.message);
        return response.status(500).json({ error: 'Erro ao estornar pagamento.' });
    }
}
