// T-04.7 — seed da comanda (CA-04.7.d, D-66): idempotente e coerente com as regras que a
// API aplica. O seed escreve direto no banco, então é aqui que se prova que ele não
// fabrica um estado que a própria API nunca produziria.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { QueryTypes } from 'sequelize';
import sequelize from '../database/connections/sequelize.js';
import { createApp } from './helpers/createApp.js';
import { truncateAll } from './helpers/db.js';

const app = createApp();
const seedDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'seed');

// Mesma ordem do `node command.js seed`.
async function runSeed() {
    for (const file of ['seed_hotels.sql', 'seed_consumo.sql']) {
        await sequelize.query(await readFile(path.join(seedDir, file), 'utf-8'));
    }
}

const count = async (table) =>
    (await sequelize.query(`SELECT COUNT(*)::int AS n FROM ${table}`, { type: QueryTypes.SELECT }))[0].n;

const TABLES = ['users', 'products', 'accounts', 'account_items', 'reservations', 'payments'];

async function login(email) {
    const res = await request(app).post('/auth/login').send({ email, password: 'senha123' });
    if (res.status !== 200) throw new Error(`login ${email} falhou: ${JSON.stringify(res.body)}`);
    return { Authorization: `Bearer ${res.body.token}` };
}

let firstRun;

beforeAll(async () => {
    await truncateAll();
    await runSeed();
    firstRun = Object.fromEntries(await Promise.all(TABLES.map(async (t) => [t, await count(t)])));
    await runSeed();
});

describe('seed da comanda — idempotência', () => {
    it('rodar duas vezes não duplica nada', async () => {
        for (const table of TABLES) expect({ table, n: await count(table) }).toEqual({ table, n: firstRun[table] });
    });

    it('rodar numa sessão com outro fuso também não duplica (horários com -03 no arquivo)', async () => {
        const sql = await readFile(path.join(seedDir, 'seed_consumo.sql'), 'utf-8');
        // Uma chamada só = uma conexão: o SET vale para o arquivo e o RESET devolve o pool limpo.
        await sequelize.query(`SET TIME ZONE 'America/Sao_Paulo'; ${sql}; RESET TIME ZONE;`);
        for (const table of TABLES) expect({ table, n: await count(table) }).toEqual({ table, n: firstRun[table] });
    });

    it('a conta da suíte abre às 14h de Brasília do dia da entrada', async () => {
        const [{ opened }] = await sequelize.query(`
            SELECT to_char(a.opened_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI') AS opened
            FROM accounts a
            JOIN rooms rm  ON rm.id = a.room_id
            JOIN tenants t ON t.id = a.tenant_id AND t.subdomain = 'aurora'
            WHERE a.type = 'ROOM' AND rm.number = '106'`, { type: QueryTypes.SELECT });
        expect(opened).toBe('2026-06-15 14:00');
    });

    it('cria cardápio, contas e lançamentos', () => {
        expect(firstRun.products).toBe(14);
        expect(firstRun.account_items).toBe(12);
    });
});

describe('seed da comanda — coerente com as regras da API', () => {
    it('toda reserva CHECKED_IN tem exatamente uma conta de diária, aberta, no quarto principal (D-58)', async () => {
        const rows = await sequelize.query(`
            SELECT r.id, COUNT(a.id)::int AS lodging,
                   BOOL_AND(a.room_id = r.room_id AND a.guest_id = r.guest_id AND a.status = 'OPEN') AS ok
            FROM reservations r
            LEFT JOIN accounts a ON a.reservation_id = r.id AND a.charges_lodging AND a.deleted_at IS NULL
            WHERE r.status = 'CHECKED_IN'
            GROUP BY r.id`, { type: QueryTypes.SELECT });
        expect(rows.length).toBeGreaterThan(0);
        for (const row of rows) expect(row).toEqual({ id: row.id, lodging: 1, ok: true });
    });

    it('só reserva em andamento tem conta: nenhuma conta em reserva que não está CHECKED_IN', async () => {
        const [{ n }] = await sequelize.query(`
            SELECT COUNT(*)::int AS n FROM accounts a JOIN reservations r ON r.id = a.reservation_id
            WHERE r.status <> 'CHECKED_IN'`, { type: QueryTypes.SELECT });
        expect(n).toBe(0);
    });

    it('lançamento só de produto ativo do mesmo hotel, com o preço do cardápio', async () => {
        const [{ n }] = await sequelize.query(`
            SELECT COUNT(*)::int AS n FROM account_items ai
            JOIN products p ON p.id = ai.product_id
            WHERE p.tenant_id <> ai.tenant_id OR NOT p.active
               OR ai.unit_price <> p.price OR ai.description <> p.name`, { type: QueryTypes.SELECT });
        expect(n).toBe(0);
    });

    it('garçom só lança item faturável do cardápio em mesa ou balcão (D-8, CA-04.1.l)', async () => {
        const [{ n }] = await sequelize.query(`
            SELECT COUNT(*)::int AS n FROM account_items ai
            JOIN users u ON u.id = ai.created_by AND u.role = 'WAITER'
            JOIN accounts a ON a.id = ai.account_id
            WHERE a.type NOT IN ('TABLE', 'DIRECT') OR NOT ai.billable OR ai.product_id IS NULL`, { type: QueryTypes.SELECT });
        expect(n).toBe(0);
    });

    it('relatório de consumo interno do Aurora bate com o resumo do arquivo', async () => {
        const res = await request(app).get('/analytics/internal-consumption').set(await login('admin@aurora.example'));
        expect(res.status).toBe(200);
        expect(res.body).toEqual([
            { reason: 'STAFF',        count: 1, total: 270 },
            { reason: 'COURTESY',     count: 2, total: 103 },
            { reason: 'LOSS',         count: 1, total: 89 },
            { reason: 'INTERNAL_USE', count: 1, total: 60 }
        ]);
    });

    it('o bill da Suíte 106 sai pela API, com a cortesia fora do total', async () => {
        const auth = await login('admin@aurora.example');
        const accounts = (await request(app).get('/accounts?type=ROOM').set(auth)).body;
        const suite = accounts.find((a) => a.label === 'Suíte 106');
        const bill = await request(app).get(`/accounts/${suite.id}/bill`).set(auth);
        expect(bill.status).toBe(200);
        // 4 × 12 + 32 + 3 × 15 = 125; o vinho de cortesia (89) fica gravado, mas fora.
        expect(Number(bill.body.consumptions)).toBe(125);
        expect(bill.body.items).toHaveLength(4);
    });

    it('o garçom do seed entra e vê o cardápio e a Mesa 3', async () => {
        const auth = await login('garcom@aurora.example');
        const products = (await request(app).get('/products').set(auth)).body;
        expect(products.some((p) => p.name === 'Cerveja long neck')).toBe(true);

        const accounts = await request(app).get('/accounts').set(auth);
        expect(accounts.status).toBe(200);
        expect(accounts.body.some((a) => a.label === 'Mesa 3')).toBe(true);
    });
});
