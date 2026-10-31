import fs from 'fs';
import path from 'path';
import { createPublicKey } from 'crypto';

/**
 * Chave PÚBLICA do JWT RS256 (ADR-006). O analytics só VERIFICA token — quem emite é o core, com a
 * privada, que nunca é montada aqui. Mesma convenção de caminho do core (`JWT_PUBLIC_KEY_PATH`,
 * relativo ao diretório de trabalho; padrão `keys/jwt-public.pem`).
 *
 * Fail-closed: sem chave, chave vazia, chave que não é RSA ou — pior — uma chave PRIVADA no lugar
 * da pública, lança na hora. Com a privada montada, este serviço ganharia poder de emitir token de
 * qualquer hotel (CA-01.3.b).
 */
let cached = null;

export function assertPublicKey(pem) {
    if (/PRIVATE KEY/.test(pem)) {
        throw new Error('O arquivo da chave pública do JWT contém uma chave PRIVADA — monte só a jwt-public.pem no analytics.');
    }
    let chave;
    try {
        chave = createPublicKey(pem);
    } catch (error) {
        throw new Error(`Chave pública do JWT inválida (${error.message}).`);
    }
    if (chave.asymmetricKeyType !== 'rsa') {
        throw new Error(`Chave pública do JWT não é RSA (${chave.asymmetricKeyType}) — o contrato é RS256.`);
    }
}

export function getPublicKey() {
    if (!cached) {
        const keyPath = path.resolve(process.cwd(), process.env.JWT_PUBLIC_KEY_PATH || 'keys/jwt-public.pem');
        if (!fs.existsSync(keyPath)) {
            throw new Error(`Chave pública do JWT não encontrada em ${keyPath}. Configure JWT_PUBLIC_KEY_PATH com a jwt-public.pem do core.`);
        }
        const pem = fs.readFileSync(keyPath, 'utf8');
        assertPublicKey(pem);
        cached = pem;
    }
    return cached;
}
