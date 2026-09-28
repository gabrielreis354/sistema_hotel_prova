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
import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'fs';
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

const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});

try {
    mkdirSync(keysDir, { recursive: true });
    writeFileSync(privatePath, privateKey, { mode: 0o600 });
    writeFileSync(publicPath, publicKey, { mode: 0o644 });
    // O `mode` do writeFileSync só vale na CRIAÇÃO — com --force sobre um arquivo que já
    // existia, a permissão antiga ficava. chmod explícito garante 0600 na privada sempre.
    chmodSync(privatePath, 0o600);
    chmodSync(publicPath, 0o644);
} catch (error) {
    if (error.code === 'EACCES' || error.code === 'EPERM') {
        // Caso típico: `docker compose up` rodou ANTES deste script — o Docker cria a pasta
        // do volume (keys/) como root, e o usuário comum não consegue mais gravar nela.
        console.error(`❌ Sem permissão para gravar em ${keysDir}.`);
        console.error('   Se o docker compose subiu antes de gerar as chaves, o Docker criou a pasta como root.');
        console.error(`   Remova e gere de novo:  sudo rm -rf "${keysDir}" && node "${fileURLToPath(import.meta.url)}"`);
        process.exit(1);
    }
    throw error;
}

console.log(`✅ Par de chaves RS256 gerado em ${keysDir}`);
console.log('   jwt-private.pem — NUNCA versionar, NUNCA compartilhar fora do core-service');
console.log('   jwt-public.pem  — distribuída aos demais serviços para verificar o JWT');
