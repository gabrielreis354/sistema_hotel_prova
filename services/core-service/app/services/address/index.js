import ViaCepAddressProvider from './ViaCepAddressProvider.js';

/**
 * Factory do provider de endereço. Seleciona a implementação pelo env ADDRESS_PROVIDER.
 * Default: 'viacep'. Mesmo formato de app/services/pix/index.js.
 *
 * Para adicionar outro provedor:
 *   1. crie app/services/address/OutroAddressProvider.js implementando o contrato AddressProvider
 *   2. registre no switch abaixo
 *   3. defina ADDRESS_PROVIDER=outro no .env
 */
const PROVIDERS = {
    viacep: ViaCepAddressProvider
};

let instance = null;

export default function getAddressProvider() {
    if (instance) return instance;

    const key = (process.env.ADDRESS_PROVIDER || 'viacep').toLowerCase();
    const Provider = PROVIDERS[key] || ViaCepAddressProvider;
    instance = new Provider();
    return instance;
}
