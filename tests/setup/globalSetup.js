// Roda UMA VEZ em processo separado antes de todos os testes.
// Responsabilidades: criar o banco de teste e sincronizar o schema.
import dotenv from 'dotenv';
import { resolve } from 'path';
import pg from 'pg';

const { Client } = pg;

export async function setup() {
    dotenv.config({ path: resolve(process.cwd(), '.env.test'), override: true });

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
    // NOTA: sequelize.sync não cria constraints customizadas (ex: EXCLUDE USING gist em reservations).
    // A proteção de double-booking é testada via lógica de aplicação (checkReservationConflict.js).
    // Para testar a constraint de banco, seria necessário rodar db/schema.sql aqui.
    await sequelize.close();

    console.log('✅ [globalSetup] Schema sincronizado no banco de teste');
}
