/**
 * PixProvider — contrato (interface) de um provedor de cobrança PIX.
 *
 * A lógica de reserva NÃO conhece o PSP concreto: depende apenas deste contrato.
 * Trocar de provedor (simulado → Mercado Pago/Efí/Asaas) não altera os controllers.
 */
export default class PixProvider {
    /**
     * true quando o PSP exige o CPF do pagador para gerar a cobrança (o Asaas exige
     * `cpfCnpj` no cadastro do cliente). O controller usa isto para devolver 400 com uma
     * mensagem clara, em vez de um 503 vindo do PSP.
     */
    get requiresPayerCpf() {
        return false;
    }

    /**
     * Cria uma cobrança PIX.
     * @param {object} params
     * @param {number} params.amount        — valor em reais (ex.: 135.00)
     * @param {string} params.description    — descrição exibida ao pagador
     * @param {string} params.externalId     — id da reserva (correlaciona webhook → reserva; também usado como chave de idempotência)
     * @param {number} [params.expiresInMinutes=30]
     * @param {string} [params.payerName]    — nome do hóspede (o Asaas exige no cadastro do cliente)
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

    /**
     * Consulta o status real da cobrança na fonte de verdade do provedor. A assinatura do
     * webhook só prova quem enviou a notificação — nunca que o pagamento foi aprovado. Todo
     * controller precisa chamar isto antes de marcar um Payment como PAID.
     * @param {string} providerChargeId
     * @returns {Promise<{ status: 'PAID'|'FAILED'|'PENDING', amount: number|null, amountVerifiable: boolean }>}
     *   status: SEMPRE um valor de CHARGE_STATUS (./chargeStatus.js) — o provider traduz o
     *   vocabulário do PSP; o controller nunca vê o status cru.
     *   amountVerifiable: false SÓ quando o provedor não tem como confirmar o valor (o
     *   simulado). Provider real devolve true e amount preenchido — ou lança
     *   PixProviderUnavailableError; valor ausente nunca pode virar confirmação.
     * @throws {import('./errors.js').PixProviderUnavailableError} se o provedor estiver inacessível
     */
    async getChargeStatus() {
        throw new Error('getChargeStatus() não implementado pelo provider PIX.');
    }
}
