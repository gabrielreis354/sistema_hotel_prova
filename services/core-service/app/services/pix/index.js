import FakePixProvider from './FakePixProvider.js';
import MercadoPagoPixProvider from './MercadoPagoPixProvider.js';
import AsaasPixProvider from './AsaasPixProvider.js';

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
    mercadopago: MercadoPagoPixProvider,
    asaas: AsaasPixProvider
};

let instance = null;

/**
 * Nome canônico do provider ativo. Vazio ou ausente → 'fake'. Valor fora da lista
 * lança erro (allowlist, fail-safe): antes, um erro de digitação como "assas" caía
 * calado no fake, e o hotel achava que cobrava de verdade sem cobrar nada.
 * O _web.js chama getPixProvider() na subida, então o erro aparece no deploy.
 */
export function resolvePixProviderKey() {
    const key = (process.env.PIX_PROVIDER || '').trim().toLowerCase() || 'fake';
    if (!Object.hasOwn(PROVIDERS, key)) {
        throw new Error(
            `PIX_PROVIDER desconhecido: "${process.env.PIX_PROVIDER}". Use um destes: ${Object.keys(PROVIDERS).join(', ')}`
        );
    }
    return key;
}

export default function getPixProvider() {
    if (instance) return instance;

    const Provider = PROVIDERS[resolvePixProviderKey()];
    instance = new Provider();
    return instance;
}

// A suíte de testes roda com isolate:false (um processo só, módulos compartilhados entre
// arquivos — ver vitest.config.js). Sem isto, um arquivo que troca PIX_PROVIDER contamina o
// provider ativo para todos os arquivos seguintes.
export function resetPixProviderForTests() {
    instance = null;
}
