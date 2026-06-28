import FakePixProvider from './FakePixProvider.js';

/**
 * Factory do provider PIX. Seleciona a implementação pelo env PIX_PROVIDER.
 * Default: 'fake' (simulado) — adequado para demo/TCC.
 *
 * Para adicionar um PSP real:
 *   1. crie app/services/pix/RealPixProvider.js implementando o contrato PixProvider
 *   2. registre no switch abaixo
 *   3. defina PIX_PROVIDER=mercadopago (ou outro) no .env
 */
const PROVIDERS = {
    fake: FakePixProvider
};

let instance = null;

export default function getPixProvider() {
    if (instance) return instance;

    const key = (process.env.PIX_PROVIDER || 'fake').toLowerCase();
    const Provider = PROVIDERS[key] || FakePixProvider;
    instance = new Provider();
    return instance;
}
