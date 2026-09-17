/**
 * PixProvider — contrato (interface) de um provedor de cobrança PIX.
 *
 * A lógica de reserva NÃO conhece o PSP concreto: depende apenas deste contrato.
 * Trocar de provedor (simulado → Mercado Pago/Efí/Asaas) não altera os controllers.
 */
export default class PixProvider {
    /**
     * Cria uma cobrança PIX.
     * @param {object} params
     * @param {number} params.amount        — valor em reais (ex.: 135.00)
     * @param {string} params.description    — descrição exibida ao pagador
     * @param {string} params.externalId     — id da reserva (correlaciona webhook → reserva; também usado como chave de idempotência)
     * @param {number} [params.expiresInMinutes=30]
     * @param {string} [params.payerEmail]   — e-mail do hóspede, quando disponível (PSPs reais exigem)
     * @param {string} [params.payerCpf]     — CPF do hóspede, quando disponível
     * @returns {Promise<{ providerChargeId: string, qrCode: string, expiration: Date }>}
     */
    async createCharge() {
        throw new Error('createCharge() não implementado pelo provider PIX.');
    }

    /**
     * Extrai e valida a notificação de webhook do provedor (assinatura, quando aplicável).
     * @param {import('express').Request} request
     * @returns {{ providerChargeId: string }}
     * @throws {import('./errors.js').InvalidWebhookSignatureError} se a assinatura for inválida
     */
    verifyWebhook() {
        throw new Error('verifyWebhook() não implementado pelo provider PIX.');
    }
}
