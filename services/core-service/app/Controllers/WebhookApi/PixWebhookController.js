import sequelize from '../../../database/connections/sequelize.js';
import PaymentModel from '../../Models/PaymentModel.js';
import ReservationModel from '../../Models/ReservationModel.js';
import getPixProvider from '../../services/pix/index.js';
import { InvalidWebhookSignatureError, PixProviderUnavailableError } from '../../services/pix/errors.js';

/**
 * POST /webhooks/pix
 *
 * Callback do provedor PIX confirmando um pagamento. Em produção, um PSP real
 * assina a requisição (validar assinatura aqui antes de confiar). No provider
 * simulado, o "pagamento" é disparado manualmente com o provider_charge_id.
 *
 * A assinatura só prova quem enviou a notificação — nunca que o pagamento foi aprovado
 * (o MP notifica em payment.created e também em cancelled/rejected). Por isso o status é
 * sempre confirmado na fonte (provider.getChargeStatus) antes de qualquer efeito.
 *
 * Efeito: com status aprovado e valor batendo, marca o pagamento como PAID e, se a reserva
 * estiver PENDING, promove para CONFIRMED — respeitando a máquina de estados (não mexe em
 * CHECKED_IN etc.). Cancelado/rejeitado marca o pagamento como FAILED. Qualquer outro status
 * (pending, in_process...) não tem efeito — aguarda nova notificação. Idempotente: reprocessar
 * um pagamento já em estado terminal não repete efeito.
 *
 * A extração/validação do id da cobrança é responsabilidade do provider ativo
 * (provider.verifyWebhook) — o fake só lê provider_charge_id do body; um PSP real valida a
 * assinatura da notificação antes de confiar em qualquer id (nunca confia em POST anônimo).
 */
export default async function PixWebhookController(request, response) {
    try {
        const provider = getPixProvider();

        let provider_charge_id;
        try {
            ({ providerChargeId: provider_charge_id } = provider.verifyWebhook(request));
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

        // Idempotência: se já chegou a um estado terminal, não reprocessa.
        if (['PAID', 'FAILED', 'EXPIRED'].includes(payment.status)) {
            return response.status(200).json({ status: 'already_processed', payment_id: payment.id });
        }

        let chargeStatus;
        try {
            chargeStatus = await provider.getChargeStatus(provider_charge_id);
        } catch (statusError) {
            if (statusError instanceof PixProviderUnavailableError) {
                // Não confirmamos nada sem saber o status real — devolve não-2xx para o
                // provedor tentar de novo depois, em vez de aceitar a notificação no escuro.
                return response.status(503).json({ error: 'Não foi possível confirmar o status do pagamento' });
            }
            throw statusError;
        }

        const amountMatches = chargeStatus.amount == null
            || Number(chargeStatus.amount).toFixed(2) === Number(payment.amount).toFixed(2);

        if (chargeStatus.status !== 'approved' || !amountMatches) {
            if (['cancelled', 'rejected'].includes(chargeStatus.status) || !amountMatches) {
                const transaction = await sequelize.transaction();
                try {
                    payment.status = 'FAILED';
                    await payment.save({ transaction });
                    await transaction.commit();
                } catch (txError) {
                    await transaction.rollback();
                    throw txError;
                }
                return response.status(200).json({ status: 'not_approved', payment_id: payment.id });
            }

            // pending, in_process, authorized... — sem efeito, aguarda a próxima notificação.
            return response.status(200).json({ status: 'pending', payment_id: payment.id });
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
