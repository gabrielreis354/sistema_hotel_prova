import sequelize from '../../../database/connections/sequelize.js';
import PaymentModel from '../../Models/PaymentModel.js';
import ReservationModel from '../../Models/ReservationModel.js';
import getPixProvider from '../../services/pix/index.js';
import { InvalidWebhookSignatureError, PixProviderUnavailableError } from '../../services/pix/errors.js';
import { CHARGE_STATUS } from '../../services/pix/chargeStatus.js';

/**
 * POST /webhooks/pix
 *
 * Callback do provedor PIX confirmando um pagamento. Exige notificação
 * assinada pelo provider ativo — sem isso, quem soubesse a URL e um
 * provider_charge_id confirmava pagamento sem pagar nada (T-06.9).
 * Fail-closed: sem o secret do provider configurado, TODA requisição é
 * recusada — nunca "aceita por padrão".
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
 * A validação da assinatura e a extração do id da cobrança são responsabilidade do provider
 * ativo (provider.verifyWebhook): o fake confere o HMAC de `x-pix-signature` com
 * PIX_WEBHOOK_SECRET; o Mercado Pago confere o `x-signature` com MERCADOPAGO_WEBHOOK_SECRET;
 * o Asaas confere o token do cabeçalho `asaas-access-token` com ASAAS_WEBHOOK_TOKEN.
 */
export default async function PixWebhookController(request, response) {
    try {
        const provider = getPixProvider();

        // A assinatura é validada ANTES de qualquer consulta ao banco — uma requisição não
        // assinada não deve nem ganhar a chance de descobrir se um charge_id existe (404) ou
        // não (400), sinal que ajudaria um atacante a enumerar cobranças.
        let provider_charge_id;
        try {
            ({ providerChargeId: provider_charge_id } = provider.verifyWebhook(request));
        } catch (verifyError) {
            if (verifyError instanceof InvalidWebhookSignatureError) {
                // Logado: um secret divergente do PSP vira 401 em todo callback — sem log,
                // ninguém descobre por que as reservas pararam de confirmar.
                console.error('PixWebhookController:', verifyError.message);
                return response.status(401).json({ error: 'Assinatura inválida' });
            }
            throw verifyError;
        }
        if (!provider_charge_id || typeof provider_charge_id !== 'string') {
            return response.status(400).json({ error: 'provider_charge_id obrigatório' });
        }

        // A cobrança é única globalmente (id do PSP) — não há subdomínio no callback.
        const payment = await PaymentModel.findOne({ where: { provider_charge_id } });
        if (!payment) {
            // Cobrança sem pagamento no banco: típico de cobrança órfã (a reserva falhou depois
            // de a cobrança ser criada no PSP). Logado com o id para reconciliação.
            console.warn('PixWebhookController: notificação de cobrança sem pagamento no banco — reconciliar no PSP', provider_charge_id);
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
                console.error('PixWebhookController: status da cobrança indisponível', provider_charge_id, statusError.message);
                // Não confirmamos nada sem saber o status real — devolve não-2xx para o
                // provedor tentar de novo depois, em vez de aceitar a notificação no escuro.
                return response.status(503).json({ error: 'Não foi possível confirmar o status do pagamento' });
            }
            throw statusError;
        }

        // Só pula a conferência de valor quando o provider DECLARA que não tem como fazê-la
        // (o simulado). Valor ausente num provider real nunca vira confirmação (fail-safe).
        const amountMatches = chargeStatus.amountVerifiable === false
            || (chargeStatus.amount != null
                && Number(chargeStatus.amount).toFixed(2) === Number(payment.amount).toFixed(2));

        // chargeStatus.status já vem normalizado pelo provider (CHARGE_STATUS) — o controller
        // não conhece o vocabulário de nenhum PSP.
        if (chargeStatus.status !== CHARGE_STATUS.PAID || !amountMatches) {
            // FAILED só quando o provedor encerrou a cobrança ou quando disse "pago" com um
            // valor que não bate (sinal de fraude). Qualquer status não-terminal (PENDING) —
            // mesmo com valor ainda desconhecido — não pode travar em FAILED: uma notificação
            // futura com o status final correto precisa continuar podendo confirmar o pagamento.
            const isTerminalNegative = chargeStatus.status === CHARGE_STATUS.FAILED;
            const isApprovedWithWrongAmount = chargeStatus.status === CHARGE_STATUS.PAID && !amountMatches;

            if (isTerminalNegative || isApprovedWithWrongAmount) {
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

            // PENDING — sem efeito, aguarda a próxima notificação.
            return response.status(200).json({ status: 'pending', payment_id: payment.id });
        }

        const transaction = await sequelize.transaction();
        try {
            // Pagamento e reserva lidos com lock DENTRO da transação, e o status reconferido sob
            // o lock. Sem isso: um check-in simultâneo (que aceita PENDING) era sobrescrito e a
            // reserva voltava de CHECKED_IN para CONFIRMED; duas notificações iguais em paralelo
            // processavam duas vezes (qa-redteam de 12/10, 🟡-2; pendência N4 da Etapa F).
            const lockedPayment = await PaymentModel.findOne({ where: { id: payment.id }, lock: transaction.LOCK.UPDATE, transaction });
            if (['PAID', 'FAILED', 'EXPIRED'].includes(lockedPayment.status)) {
                await transaction.rollback();
                return response.status(200).json({ status: 'already_processed', payment_id: payment.id });
            }
            lockedPayment.status = 'PAID';
            lockedPayment.paid_at = new Date();
            await lockedPayment.save({ transaction });

            const reservation = await ReservationModel.findOne({
                where: { id: payment.reservation_id, tenant_id: payment.tenant_id },
                lock: transaction.LOCK.UPDATE,
                transaction
            });

            // Só promove PENDING → CONFIRMED. Outros estados não são tocados — mas um sinal pago
            // para reserva já cancelada (ou em outro estado) é dinheiro a devolver: log para o
            // hotel reconciliar (🟡-3).
            if (reservation && reservation.status === 'PENDING') {
                reservation.status = 'CONFIRMED';
                await reservation.save({ transaction });
            } else {
                console.warn('PixWebhookController: sinal pago para reserva fora de PENDING — reconciliar/estornar',
                    { payment_id: payment.id, reservation_id: payment.reservation_id, reservation_status: reservation?.status ?? null });
            }

            await transaction.commit();

            return response.status(200).json({
                status: 'confirmed',
                payment_id: payment.id,
                reservation_id: payment.reservation_id,
                reservation_status: reservation ? reservation.status : null
            });
        } catch (txError) {
            if (!transaction.finished) await transaction.rollback();
            throw txError;
        }
    } catch (error) {
        console.error('PixWebhookController:', error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
