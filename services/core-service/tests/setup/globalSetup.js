// Roda UMA VEZ em processo separado antes de todos os testes.
// Responsabilidades: criar o banco de teste, sincronizar o schema e gerar o
// par de chaves RS256 efêmero do JWT (ADR-006).
import dotenv from 'dotenv';
import { dirname, resolve } from 'path';
import { generateKeyPairSync } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import pg from 'pg';
import { assertKeyPair } from '../../app/utils/jwtKeys.js';

const { Client } = pg;

export async function setup() {
    dotenv.config({ path: resolve(process.cwd(), '.env.test'), override: true });

    // 0. Chaves RS256 efêmeras (ADR-006), nunca versionadas (.gitignore: .tmp-jwt-keys/).
    // Geradas SÓ se faltarem ou se o par existente estiver quebrado — reaproveitar o par
    // da rodada anterior é seguro (é chave de teste, não sai da máquina) e evita custo.
    // globalSetup roda num processo à parte, ANTES de qualquer worker de teste subir
    // (garantido pelo Vitest), por isso as chaves vão para disco e não para memória.
    const { JWT_PRIVATE_KEY_PATH, JWT_PUBLIC_KEY_PATH } = process.env;
    if (!JWT_PRIVATE_KEY_PATH || !JWT_PUBLIC_KEY_PATH) {
        throw new Error(
            '[globalSetup] JWT_PRIVATE_KEY_PATH/JWT_PUBLIC_KEY_PATH não definidos. Seu .env.test ' +
            'provavelmente é anterior à ADR-006 — copie de novo: cp .env.test.example .env.test'
        );
    }
    const privatePath = resolve(process.cwd(), JWT_PRIVATE_KEY_PATH);
    const publicPath = resolve(process.cwd(), JWT_PUBLIC_KEY_PATH);

    let parUtilizavel = existsSync(privatePath) && existsSync(publicPath);
    if (parUtilizavel) {
        try {
            assertKeyPair(readFileSync(privatePath, 'utf8'), readFileSync(publicPath, 'utf8'));
        } catch (erro) {
            // Par meio trocado de uma rodada anterior: sem isto, TODO teste autenticado
            // falharia com 401, sem pista do motivo.
            console.log(`⚠️  [globalSetup] Par de chaves de teste inválido (${erro.message}) — regerando`);
            parUtilizavel = false;
        }
    }
    if (!parUtilizavel) {
        const { publicKey, privateKey } = generateKeyPairSync('rsa', {
            modulusLength: 2048,
            publicKeyEncoding: { type: 'spki', format: 'pem' },
            privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
        });
        mkdirSync(dirname(privatePath), { recursive: true });
        mkdirSync(dirname(publicPath), { recursive: true });
        writeFileSync(privatePath, privateKey, { mode: 0o600 });
        writeFileSync(publicPath, publicKey, { mode: 0o644 });
        console.log('✅ [globalSetup] Par de chaves RS256 efêmero gerado para os testes');
    }

    // 1. Criar banco de teste se não existir
    const admin = new Client({
        host:     process.env.POSTGRES_HOST     || 'localhost',
        port:     Number(process.env.POSTGRES_PORT) || 5432,
        user:     process.env.POSTGRES_USER     || 'hotel_user',
        password: process.env.POSTGRES_PASSWORD || 'hotel_password',
        database: 'postgres',
    });

    await admin.connect();
    try {
        await admin.query('CREATE DATABASE gestao_hotel_test');
        console.log('\n✅ [globalSetup] Banco de teste criado: gestao_hotel_test');
    } catch (e) {
        if (e.message.includes('already exists')) {
            console.log('\nℹ️  [globalSetup] Banco de teste já existe: gestao_hotel_test');
        } else {
            throw e;
        }
    } finally {
        await admin.end();
    }

    // 2. Sincronizar schema (DROP + CREATE todas as tabelas na ordem correta)
    // Dynamic import garante que o IIFE do sequelize.js lê as env vars JÁ setadas
    const { default: sequelize }     = await import('../../database/connections/sequelize.js');
    const { default: initRelations } = await import('../../database/relations.js');

    initRelations();
    await sequelize.sync({ force: true });

    // sync() não cria extensão, EXCLUDE, CHECK nem índice composto — as validações
    // `validate:` dos models vivem só na aplicação. Sem aplicar os mesmos objetos que
    // o `command.js migrate` aplica, o banco de teste fica MAIS PERMISSIVO que o de
    // produção e a suíte passa verde sobre um schema que não existe lá.
    const { default: applyDbConstraints } = await import('../../database/applyDbConstraints.js');
    await applyDbConstraints(sequelize);

    await sequelize.close();

    console.log('✅ [globalSetup] Schema sincronizado + constraints aplicadas no banco de teste');
}
