// Roda UMA VEZ, em processo separado, antes de todos os testes: cria o banco de teste do analytics,
// sincroniza as projeções e gera o par RS256 efêmero (a privada só para os testes assinarem token).
import dotenv from 'dotenv';
import { dirname, resolve } from 'path';
import { generateKeyPairSync } from 'crypto';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import pg from 'pg';

export async function setup() {
    dotenv.config({ quiet: true, path: resolve(process.cwd(), '.env.test'), override: true });

    const { JWT_PUBLIC_KEY_PATH, TEST_JWT_PRIVATE_KEY_PATH, POSTGRES_DB } = process.env;
    if (!JWT_PUBLIC_KEY_PATH || !TEST_JWT_PRIVATE_KEY_PATH) {
        throw new Error('[globalSetup] JWT_PUBLIC_KEY_PATH/TEST_JWT_PRIVATE_KEY_PATH ausentes — cp .env.test.example .env.test');
    }
    // Trava: o sync abaixo é DROP+CREATE. Só num banco com sufixo _test.
    if (!/_test$/.test(POSTGRES_DB ?? '')) {
        throw new Error(`[globalSetup] POSTGRES_DB="${POSTGRES_DB}" não termina em _test — recusado (o setup apaga as tabelas).`);
    }

    const privatePath = resolve(process.cwd(), TEST_JWT_PRIVATE_KEY_PATH);
    const publicPath = resolve(process.cwd(), JWT_PUBLIC_KEY_PATH);
    if (!existsSync(privatePath) || !existsSync(publicPath)) {
        const { publicKey, privateKey } = generateKeyPairSync('rsa', {
            modulusLength: 2048,
            publicKeyEncoding: { type: 'spki', format: 'pem' },
            privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
        });
        mkdirSync(dirname(privatePath), { recursive: true });
        writeFileSync(privatePath, privateKey, { mode: 0o600 });
        writeFileSync(publicPath, publicKey, { mode: 0o644 });
    }

    const admin = new pg.Client({
        host: process.env.POSTGRES_HOST,
        port: Number(process.env.POSTGRES_PORT),
        user: process.env.POSTGRES_USER,
        password: process.env.POSTGRES_PASSWORD,
        database: 'postgres'
    });
    await admin.connect();
    try {
        await admin.query(`CREATE DATABASE ${POSTGRES_DB}`);
    } catch (e) {
        if (!e.message.includes('already exists')) throw e;
    } finally {
        await admin.end();
    }

    const { default: sequelize } = await import('../../database/connections/sequelize.js');
    await import('../../app/Models/index.js');
    await sequelize.sync({ force: true });
    await sequelize.close();
    console.log(`✅ [globalSetup] Projeções sincronizadas em ${POSTGRES_DB}`);
}
