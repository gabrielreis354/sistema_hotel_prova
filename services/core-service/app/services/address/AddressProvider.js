/**
 * AddressProvider — contrato de um provedor de consulta de endereço por CEP.
 *
 * A consulta é de apoio ao preenchimento de cadastro (hóspede, cliente corporativo),
 * não fonte de verdade — o endereço continua salvo como texto livre. O controller
 * não conhece o provedor concreto: depende apenas deste contrato.
 */
export default class AddressProvider {
    /**
     * Consulta um endereço a partir do CEP.
     * @param {string} cep — 8 dígitos, sem formatação
     * @returns {Promise<{ cep: string, street: string, neighborhood: string, city: string, state: string, complement: string|null }>}
     */
    async lookup() {
        throw new Error('lookup() não implementado pelo provider de endereço.');
    }
}
