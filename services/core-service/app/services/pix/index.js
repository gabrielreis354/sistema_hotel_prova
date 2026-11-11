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
let instanceKey = null;

/**
 * Nome canônico do provider pedido no env. Vazio ou ausente → 'fake'. Valor fora da lista
 * lança erro (allowlist, fail-safe): antes, um erro de digitação como "assas" caía
 * calado no fake, e o hotel achava que cobrava de verdade sem cobrar nada.
 * O _web.js chama getPixProvider() na subida, então o erro aparece no deploy.
 *
 * A mensagem NÃO repete o valor do env: se alguém colar a chave do Asaas no lugar
 * errado (PIX_PROVIDER=$aact_...), ela não pode ir parar no log.
 */
function resolvePixProviderKey() {
    const key = (process.env.PIX_PROVIDER || '').trim().toLowerCase() || 'fake';
    if (!Object.hasOwn(PROVIDERS, key)) {
        throw new Error(`PIX_PROVIDER desconhecido. Use um destes: ${Object.keys(PROVIDERS).join(', ')}`);
    }
    return key;
}

export default function getPixProvider() {
    if (instance) return instance;

    const key = resolvePixProviderKey();
    instance = new PROVIDERS[key]();
    instanceKey = key;
    return instance;
}

/**
 * Nome do provider da instância ativa, para gravar no Payment. Vem da mesma fonte que
 * cobrou: reler o env aqui poderia gravar um PSP diferente do que gerou a cobrança.
 */
export function getPixProviderKey() {
    getPixProvider();
    return instanceKey;
}

// A suíte de testes roda com isolate:false (um processo só, módulos compartilhados entre
// arquivos — ver vitest.config.js). Sem isto, um arquivo que troca PIX_PROVIDER contamina o
// provider ativo para todos os arquivos seguintes.
export function resetPixProviderForTests() {
    instance = null;
    instanceKey = null;
}
