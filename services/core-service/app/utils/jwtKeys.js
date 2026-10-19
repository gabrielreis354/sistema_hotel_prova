import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';

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
 * Confere que o par funciona de verdade: assina um JWT RS256 com a privada e o verifica com a
 * pública — o mesmo caminho do LoginController e do auth.middleware. Uma operação pega arquivo
 * vazio, PEM inválido, chave que não é RSA e chaves de pares diferentes, sem validação ad hoc.
 * Chamado no boot (_web.js): sem isto, par trocado (secret recriado pela metade) subia
 * "healthy" — login 500 e toda rota protegida 401, sem log (achado 🟡-5 da auditoria de 27/09).
 * Função pura: recebe o conteúdo, não lê arquivo.
 */
export function assertKeyPair(privatePem, publicPem) {
    // O jsonwebtoken verifica até com a privada (deriva a pública dela) — a assinatura abaixo
    // passaria. Mas quem recebe a privada no lugar da pública ganha poder de EMITIR token: num
    // serviço que só verifica, o CA-01.3.b cairia sem sinal nenhum.
    if (/PRIVATE KEY/.test(publicPem)) {
        throw new Error('O arquivo da chave pública do JWT contém uma chave PRIVADA — monte só a jwt-public.pem.');
    }

    let token;
    try {
        token = jwt.sign({ prova: 'boot' }, privatePem, { algorithm: 'RS256', expiresIn: 60 });
    } catch (error) {
        throw new Error(`Chave privada do JWT não assina RS256 — ${error.message}.`);
    }

    try {
        jwt.verify(token, publicPem, { algorithms: ['RS256'] });
    } catch (error) {
        throw new Error(
            `Chave pública do JWT não verifica o token da privada (${error.message}): ou ela é ` +
            'inválida, ou as duas não formam um par — uma foi regerada sem a outra. Gere o par ' +
            'de novo e atualize os dois arquivos juntos.'
        );
    }
}
