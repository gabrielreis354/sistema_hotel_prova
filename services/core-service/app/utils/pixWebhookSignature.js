import crypto from 'crypto';

/**
 * Assinatura HMAC-SHA256 do webhook PIX (T-06.9).
 *
 * O HMAC é calculado sobre os BYTES CRUS do corpo — nunca sobre
 * `JSON.stringify(objeto)` depois de parseado, porque a re-serialização pode
 * diferir do que foi de fato enviado (ordem de chaves, espaços). Por isso toda
 * função aqui recebe `rawBody` como string/Buffer, não como objeto.
 */

/**
 * Calcula a assinatura no formato esperado pelo cabeçalho `x-pix-signature`.
 * @param {string|Buffer} rawBody
 * @param {string} secret
 * @returns {string} `sha256=<hex>`
 */
export function computePixSignature(rawBody, secret) {
    const hmac = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    return `sha256=${hmac}`;
}

/**
 * Verifica se `receivedSignature` corresponde ao HMAC de `rawBody` com `secret`.
 * Fail-closed: qualquer parâmetro ausente (secret, assinatura, corpo) retorna false.
 * Comparação em tempo constante — checa o tamanho ANTES de chamar timingSafeEqual,
 * que lança erro (em vez de retornar false) se os buffers tiverem tamanhos diferentes.
 */
export function verifyPixSignature(rawBody, receivedSignature, secret) {
    if (!secret || !receivedSignature || rawBody === undefined || rawBody === null) {
        return false;
    }

    const expected = computePixSignature(rawBody, secret);
    const expectedBuffer = Buffer.from(expected);
    const receivedBuffer = Buffer.from(receivedSignature);

    if (expectedBuffer.length !== receivedBuffer.length) {
        return false;
    }

    return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}
