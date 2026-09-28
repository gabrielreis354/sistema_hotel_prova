import fs from 'fs';
import path from 'path';
import { createPrivateKey, createPublicKey, sign, verify } from 'crypto';

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

    const conteudo = fs.readFileSync(keyPath, 'utf8');
    if (conteudo.trim() === '') {
        throw new Error(`${label} em ${keyPath} está vazia. Gere o par de novo com "node scripts/gerar_chaves_jwt.js --force".`);
    }
    return conteudo;
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

/**
 * Confere que as duas chaves são PEM legíveis E formam um par — assina uma prova com a
 * privada e verifica com a pública. Chamado no boot (_web.js): sem isto, o fail-fast só
 * conferia se o ARQUIVO existia, e chave vazia, lixo ou par trocado (secret recriado pela
 * metade) subiam "healthy" — login dava 500 e toda rota protegida 401, sem log nenhum
 * (achado 🟡-5 da auditoria de 27/09). Função pura: recebe o conteúdo, não lê arquivo.
 */
export function assertKeyPair(privatePem, publicPem) {
    let privateKey;
    let publicKey;
    try {
        privateKey = createPrivateKey(privatePem);
    } catch {
        throw new Error('Chave privada do JWT inválida — não é uma chave PEM legível.');
    }
    try {
        publicKey = createPublicKey(publicPem);
    } catch {
        throw new Error('Chave pública do JWT inválida — não é uma chave PEM legível.');
    }
    if (privateKey.asymmetricKeyType !== 'rsa') {
        throw new Error(`Chave privada do JWT é ${privateKey.asymmetricKeyType}, mas RS256 exige RSA.`);
    }

    const prova = Buffer.from('gesway-jwt-keypair-check');
    const assinatura = sign('sha256', prova, privateKey);
    if (!verify('sha256', prova, publicKey, assinatura)) {
        throw new Error(
            'Chave privada e pública do JWT não formam um par — provavelmente uma delas foi ' +
            'regerada sem a outra. Gere o par de novo e atualize os dois arquivos juntos.'
        );
    }
}
