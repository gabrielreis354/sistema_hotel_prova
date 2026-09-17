import FakePixProvider from './FakePixProvider.js';
import MercadoPagoPixProvider from './MercadoPagoPixProvider.js';

/**
 * Factory do provider PIX. Seleciona a implementação pelo env PIX_PROVIDER.
 * Default: 'fake' (simulado) — adequado para demo/TCC.
 *
 * Para adicionar outro PSP real:
 *   1. crie app/services/pix/OutroPixProvider.js implementando o contrato PixProvider
 *   2. registre no switch abaixo
 *   3. defina PIX_PROVIDER=outro no .env
 */
const PROVIDERS = {
    fake: FakePixProvider,
    mercadopago: MercadoPagoPixProvider
};

let instance = null;

export default function getPixProvider() {
    if (instance) return instance;

    const key = (process.env.PIX_PROVIDER || 'fake').toLowerCase();
    const Provider = PROVIDERS[key] || FakePixProvider;
    instance = new Provider();
    return instance;
}
