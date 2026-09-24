import fs from 'fs';
import path from 'path';

/**
 * Carrega o par de chaves RS256 do JWT (ADR-006).
 *
 * Caminhos vêm de JWT_PRIVATE_KEY_PATH / JWT_PUBLIC_KEY_PATH (env), relativos ao
 * diretório de trabalho do processo — mesma convenção de `.env`/`.env.test`
 * (`resolve(process.cwd(), ...)`). Default: `keys/jwt-private.pem` e
 * `keys/jwt-public.pem`, a pasta que `scripts/gerar_chaves_jwt.js` cria.
 *
 * Fail-closed: sem a chave no caminho esperado, quem chamar `getPrivateKey()` ou
 * `getPublicKey()` recebe um erro claro na hora — não um `jwt.sign()`/`verify()`
 * falhando com mensagem opaca mais adiante. Mesmo princípio do
 * PIX_WEBHOOK_SECRET (T-06.9): a ausência de configuração nunca vira "aceitar".
 *
 * Cache em memória — o arquivo não muda depois que o processo sobe.
 */

let cachedPrivateKey = null;
let cachedPublicKey = null;

function readKey(envVar, defaultRelativePath, label) {
    const keyPath = path.resolve(process.cwd(), process.env[envVar] || defaultRelativePath);

    if (!fs.existsSync(keyPath)) {
        throw new Error(
            `${label} não encontrada em ${keyPath}. Rode "node scripts/gerar_chaves_jwt.js" ` +
            `(dev/local) ou configure ${envVar} apontando para o arquivo montado (cluster/CI).`
        );
    }

    return fs.readFileSync(keyPath, 'utf8');
}

export function getPrivateKey() {
    if (!cachedPrivateKey) {
        cachedPrivateKey = readKey('JWT_PRIVATE_KEY_PATH', 'keys/jwt-private.pem', 'Chave privada do JWT');
    }
    return cachedPrivateKey;
}

export function getPublicKey() {
    if (!cachedPublicKey) {
        cachedPublicKey = readKey('JWT_PUBLIC_KEY_PATH', 'keys/jwt-public.pem', 'Chave pública do JWT');
    }
    return cachedPublicKey;
}

/**
 * Identificador da chave atual, vai no cabeçalho `kid` de todo token assinado.
 * Hoje existe uma única chave — o campo prepara rotação futura sem exigir que o
 * verificador mude de formato quando uma segunda chave entrar em uso.
 */
export function getKeyId() {
    return process.env.JWT_KEY_ID || 'core-v1';
}

// Só para teste: permite forçar um novo carregamento depois de trocar os arquivos
// de chave em disco (globalSetup gera chaves efêmeras antes da suíte rodar).
export function resetKeyCache() {
    cachedPrivateKey = null;
    cachedPublicKey = null;
}
