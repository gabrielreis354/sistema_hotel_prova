#!/usr/bin/env node
// Gera o par de chaves RSA usado para assinar (privada) e verificar (pública) o
// JWT em RS256 (ADR-006, T-01.3). Uso local/dev — em CI e no cluster, cada
// ambiente gera o próprio par (ver docs/sugestoes-documentos-oficiais/07-adr/
// ADR-006-proposta.md, seção "Como as chaves chegam a cada ambiente").
//
// Uso:
//   node scripts/gerar_chaves_jwt.js
//   node scripts/gerar_chaves_jwt.js --force   # sobrescreve chaves existentes
//
// Nunca versionar a saída: services/core-service/keys/ está no .gitignore.

import { generateKeyPairSync } from 'crypto';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const keysDir = join(__dirname, '..', 'keys');
const privatePath = join(keysDir, 'jwt-private.pem');
const publicPath = join(keysDir, 'jwt-public.pem');

const force = process.argv.includes('--force');

if (!force && (existsSync(privatePath) || existsSync(publicPath))) {
    console.error(`❌ Já existe chave em ${keysDir}. Use --force para sobrescrever.`);
    console.error('   Sobrescrever invalida todo token RS256 já emitido com o par atual.');
    process.exit(1);
}

mkdirSync(keysDir, { recursive: true });

const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});

writeFileSync(privatePath, privateKey, { mode: 0o600 });
writeFileSync(publicPath, publicKey, { mode: 0o644 });

console.log(`✅ Par de chaves RS256 gerado em ${keysDir}`);
console.log('   jwt-private.pem — NUNCA versionar, NUNCA compartilhar fora do core-service');
console.log('   jwt-public.pem  — distribuída aos demais serviços para verificar o JWT');
