import sequelize from '../../../database/connections/sequelize.js';
import PaymentModel from '../../Models/PaymentModel.js';
import ReservationModel from '../../Models/ReservationModel.js';
import { verifyPixSignature } from '../../utils/pixWebhookSignature.js';

/**
 * POST /webhooks/pix
 *
 * Callback do provedor PIX confirmando um pagamento. Exige assinatura
 * HMAC-SHA256 no cabeçalho `x-pix-signature` (formato `sha256=<hex>`),
 * calculada pelo PSP sobre os bytes crus do corpo — ver
 * app/utils/pixWebhookSignature.js. Sem isso, quem soubesse a URL e um
 * provider_charge_id confirmava pagamento sem pagar nada (T-06.9).
 *
 * Fail-closed: sem PIX_WEBHOOK_SECRET configurado no ambiente, TODA
 * requisição é recusada — nunca "aceita por padrão".
 *
 * Efeito: marca o pagamento como PAID e, se a reserva estiver PENDING, promove
 * para CONFIRMED — respeitando a máquina de estados (não mexe em CHECKED_IN etc.).
 * Idempotente: reprocessar o mesmo charge não duplica efeito.
 *
 * Body: { provider_charge_id: string }
 */
export default async function PixWebhookController(request, response) {
    try {
        const secret = process.env.PIX_WEBHOOK_SECRET;
        if (!secret) {
            console.error('PixWebhookController: PIX_WEBHOOK_SECRET não configurado — recusando webhook (fail-closed)');
            return response.status(401).json({ error: 'Webhook não configurado' });
        }

        // Verificação de assinatura ANTES de qualquer leitura de request.body e
        // antes de qualquer consulta ao banco — uma requisição não assinada não
        // deve nem ganhar a chance de descobrir se um charge_id existe (404) ou
        // não (400), sinal que ajudaria um atacante a enumerar cobranças.
        const signature = request.get('x-pix-signature');
        if (!verifyPixSignature(request.rawBody, signature, secret)) {
            return response.status(401).json({ error: 'Assinatura inválida' });
        }

        const { provider_charge_id } = request.body;
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
