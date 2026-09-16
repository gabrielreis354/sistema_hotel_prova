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
     * @param {string} params.externalId     — id da reserva (correlaciona webhook → reserva)
     * @param {number} [params.expiresInMinutes=30]
     * @returns {Promise<{ providerChargeId: string, qrCode: string, expiration: Date }>}
     */
    async createCharge() {
        throw new Error('createCharge() não implementado pelo provider PIX.');
    }
}
