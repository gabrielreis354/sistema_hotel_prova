import sequelize from '../../../database/connections/sequelize.js';
import PaymentModel from '../../Models/PaymentModel.js';
import ReservationModel from '../../Models/ReservationModel.js';
import getPixProvider from '../../services/pix/index.js';
import { InvalidWebhookSignatureError } from '../../services/pix/errors.js';

/**
 * POST /webhooks/pix
 *
 * Callback do provedor PIX confirmando um pagamento. Em produção, um PSP real
 * assina a requisição (validar assinatura aqui antes de confiar). No provider
 * simulado, o "pagamento" é disparado manualmente com o provider_charge_id.
 *
 * Efeito: marca o pagamento como PAID e, se a reserva estiver PENDING, promove
 * para CONFIRMED — respeitando a máquina de estados (não mexe em CHECKED_IN etc.).
 * Idempotente: reprocessar o mesmo charge não duplica efeito.
 *
 * A extração/validação do id da cobrança é responsabilidade do provider ativo
 * (provider.verifyWebhook) — o fake só lê provider_charge_id do body; um PSP real valida a
 * assinatura da notificação antes de confiar em qualquer id (nunca confia em POST anônimo).
 */
export default async function PixWebhookController(request, response) {
    try {
        let provider_charge_id;
        try {
            ({ providerChargeId: provider_charge_id } = getPixProvider().verifyWebhook(request));
        } catch (verifyError) {
            if (verifyError instanceof InvalidWebhookSignatureError) {
                return response.status(401).json({ error: 'Assinatura da notificação inválida' });
            }
            throw verifyError;
        }
        if (!provider_charge_id) {
            return response.status(400).json({ error: 'provider_charge_id obrigatório' });
        }

        // A cobrança é única globalmente (id do PSP) — não há subdomínio no callback.
        const payment = await PaymentModel.findOne({ where: { provider_charge_id } });
        if (!payment) {
            return response.status(404).json({ error: 'Cobrança não encontrada' });
        }

        // Idempotência: se já foi processada, não faz nada de novo.
        if (payment.status === 'PAID') {
            return response.status(200).json({ status: 'already_processed', payment_id: payment.id });
        }

        const transaction = await sequelize.transaction();
        try {
            payment.status = 'PAID';
            payment.paid_at = new Date();
            await payment.save({ transaction });

            const reservation = await ReservationModel.findOne({
                where: { id: payment.reservation_id, tenant_id: payment.tenant_id },
                transaction
            });

            // Só promove PENDING → CONFIRMED. Outros estados não são tocados.
            if (reservation && reservation.status === 'PENDING') {
                reservation.status = 'CONFIRMED';
                await reservation.save({ transaction });
            }

            await transaction.commit();

            return response.status(200).json({
                status: 'confirmed',
                payment_id: payment.id,
                reservation_id: payment.reservation_id,
                reservation_status: reservation ? reservation.status : null
            });
        } catch (txError) {
            await transaction.rollback();
            throw txError;
        }
    } catch (error) {
        console.error('PixWebhookController:', error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
