import { describe, it, expect } from 'vitest';
import { generateKeyPairSync } from 'crypto';
import { assertKeyPair } from '../app/utils/jwtKeys.js';

// Teste unitário puro — sem banco, sem app. assertKeyPair é o que o _web.js chama no boot
// (fail-fast da ADR-006). Achado 🟡-5 da auditoria de 27/09: o fail-fast só conferia se o
// ARQUIVO existia — chave vazia, lixo ou par trocado subiam "healthy", o login dava 500 e
// toda rota protegida 401, sem uma linha de log.

const par = () => generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});

describe('assertKeyPair', () => {
    it('aceita um par RSA válido e correspondente', () => {
        const { privateKey, publicKey } = par();
        expect(() => assertKeyPair(privateKey, publicKey)).not.toThrow();
    });

    it('recusa chave privada vazia', () => {
        const { publicKey } = par();
        expect(() => assertKeyPair('', publicKey)).toThrow(/privada/i);
    });

    it('recusa chave privada que não é PEM válido', () => {
        const { publicKey } = par();
        expect(() => assertKeyPair('lixo-que-nao-e-chave', publicKey)).toThrow(/privada/i);
    });

    it('recusa chave pública que não é PEM válido', () => {
        const { privateKey } = par();
        expect(() => assertKeyPair(privateKey, 'lixo-que-nao-e-chave')).toThrow(/pública/i);
    });

    it('recusa par trocado (pública de outro par) — secret recriado pela metade', () => {
        const a = par();
        const b = par();
        expect(() => assertKeyPair(a.privateKey, b.publicKey)).toThrow(/não formam um par/i);
    });
});
