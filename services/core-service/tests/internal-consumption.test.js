// T-04.7 — relatório de consumo interno (CA-04.7.a a c).
// "Quanto o hotel deu de cortesia, refeição de funcionário e perda neste mês?" (RN-007).
// Decisões D-63 a D-65 em docs/specs/anexos/SPEC-04-decisoes-T-04.7.md.
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from './helpers/createApp.js';
import { truncateAll } from './helpers/db.js';
import { registerAndLogin } from './helpers/auth.js';
import AccountModel from '../app/Models/AccountModel.js';
import AccountItemModel from '../app/Models/AccountItemModel.js';

const app = createApp();
const URL = '/analytics/internal-consumption';

let jwt, receptionistJwt, waiterJwt, otherJwt;
let internalAccount, tableAccount;
let lossItem;

const auth = (token) => ({ Authorization: `Bearer ${token}` });
const report = (token, query = '') => request(app).get(`${URL}${query}`).set(auth(token));

async function openAccount(token, body) {
    const res = await request(app).post('/accounts').set(auth(token)).send(body);
    if (res.status !== 201) throw new Error(`abrir conta falhou: ${JSON.stringify(res.body)}`);
    return res.body;
}

async function postItem(token, accountId, body) {
    const res = await request(app).post(`/accounts/${accountId}/items`).set(auth(token)).send(body);
    if (res.status !== 201) throw new Error(`item falhou: ${JSON.stringify(res.body)}`);
    return res.body.item;
}

async function createUser(role) {
    const email = `${role.toLowerCase()}_${Date.now()}@test.com`;
    await request(app).post('/users').set(auth(jwt)).send({ name: role, email, password: 'senha123', role });
    const login = await request(app).post('/auth/login').send({ email, password: 'senha123' });
    return login.body.token;
}

// consumed_at é do servidor (D-26); o teste o posiciona no calendário direto no banco.
const consumedOn = (itemId, iso) => AccountItemModel.update({ consumed_at: iso }, { where: { id: itemId } });

const byReason = (rows) => Object.fromEntries(rows.map((r) => [r.reason, r]));

beforeAll(async () => {
    await truncateAll();
    ({ jwt } = await registerAndLogin(app, { tenantName: 'Hotel Relatório Interno' }));
    ({ jwt: otherJwt } = await registerAndLogin(app, { tenantName: 'Hotel Vizinho Relatório' }));
    receptionistJwt = await createUser('RECEPTIONIST');
    waiterJwt = await createUser('WAITER');

    tableAccount = await openAccount(jwt, { type: 'TABLE', label: 'Mesa 4' });
    internalAccount = await openAccount(jwt, { type: 'INTERNAL', label: 'Cozinha — funcionários' });

    // Mesa: 2 cortesias (10 + 3×5 = 25) e 1 item faturável, que não entra.
    const c1 = await postItem(jwt, tableAccount.id, { description: 'Sobremesa', unit_price: 10, quantity: 1, billable: false, reason: 'COURTESY' });
    const c2 = await postItem(jwt, tableAccount.id, { description: 'Café', unit_price: 5, quantity: 3, billable: false, reason: 'COURTESY' });
    const paid = await postItem(jwt, tableAccount.id, { description: 'Prato do dia', unit_price: 40, quantity: 1 });

    // Conta INTERNAL: tudo entra — com motivo e também o faturável sem motivo (D-63).
    const staff = await postItem(jwt, internalAccount.id, { description: 'Refeição', unit_price: 18, quantity: 2, billable: false, reason: 'STAFF' });
    lossItem = await postItem(jwt, internalAccount.id, { description: 'Garrafa quebrada', unit_price: 30, quantity: 1, billable: false, reason: 'LOSS' });
    const noReason = await postItem(jwt, internalAccount.id, { description: 'Água', unit_price: 4, quantity: 2 });

    // Excluídos não contam (D-65): item excluído e item de conta excluída.
    const deleted = await postItem(jwt, tableAccount.id, { description: 'Lançado errado', unit_price: 99, quantity: 1, billable: false, reason: 'COURTESY' });
    await request(app).delete(`/accounts/${tableAccount.id}/items/${deleted.id}`).set(auth(jwt));
    const ghost = await openAccount(jwt, { type: 'INTERNAL', label: 'Conta apagada' });
    await postItem(jwt, ghost.id, { description: 'Fantasma', unit_price: 77, quantity: 1, billable: false, reason: 'LOSS' });
    await AccountModel.destroy({ where: { id: ghost.id } });

    // Calendário: tudo em março, menos a perda (abril).
    for (const item of [c1, c2, paid, staff, noReason]) await consumedOn(item.id, '2026-03-10T15:00:00Z');
    await consumedOn(lossItem.id, '2026-04-02T15:00:00Z');

    // Hotel vizinho: uma cortesia que nunca pode aparecer aqui.
    const otherTable = await openAccount(otherJwt, { type: 'TABLE', label: 'Mesa do vizinho' });
    const otherItem = await postItem(otherJwt, otherTable.id, { description: 'Cortesia vizinha', unit_price: 500, quantity: 1, billable: false, reason: 'COURTESY' });
    await consumedOn(otherItem.id, '2026-03-10T15:00:00Z');
});

describe('GET /analytics/internal-consumption — agrupamento (CA-04.7.a/b)', () => {
    it('agrupa por reason com valor e contagem, maior valor primeiro', async () => {
        const res = await report(jwt);
        expect(res.status).toBe(200);
        expect(res.body).toEqual([
            { reason: 'STAFF',     count: 1, total: 36 },
            { reason: 'LOSS',      count: 1, total: 30 },
            { reason: 'COURTESY',  count: 2, total: 25 },
            { reason: null,        count: 1, total: 8 }
        ]);
    });

    it('item faturável de conta comum não entra; o de conta INTERNAL entra como reason null (D-63)', async () => {
        const rows = byReason((await report(jwt)).body);
        expect(rows.null).toEqual({ reason: null, count: 1, total: 8 });
        // O "Prato do dia" (40) faturável da mesa ficaria em null se vazasse.
        expect(rows.null.total).not.toBe(48);
    });

    it('não conta item excluído nem item de conta excluída (D-65)', async () => {
        const rows = byReason((await report(jwt)).body);
        expect(rows.COURTESY.total).toBe(25);
        expect(rows.LOSS.total).toBe(30);
    });

    it('não mistura dados de outro hotel', async () => {
        const mine = byReason((await report(jwt)).body);
        expect(mine.COURTESY.total).toBe(25);

        const theirs = await report(otherJwt);
        expect(theirs.body).toEqual([{ reason: 'COURTESY', count: 1, total: 500 }]);
    });

    it('conta INTERNAL fechada continua no relatório', async () => {
        await AccountModel.update({ status: 'CLOSED' }, { where: { id: internalAccount.id } });
        try {
            const rows = byReason((await report(jwt)).body);
            expect(rows.STAFF.total).toBe(36);
        } finally {
            await AccountModel.update({ status: 'OPEN' }, { where: { id: internalAccount.id } });
        }
    });

    it('hotel sem consumo interno recebe lista vazia', async () => {
        const { jwt: emptyJwt } = await registerAndLogin(app, { tenantName: 'Hotel Sem Cortesia' });
        const res = await report(emptyJwt);
        expect(res.status).toBe(200);
        expect(res.body).toEqual([]);
    });
});

describe('GET /analytics/internal-consumption — período (D-64)', () => {
    it('filtra por consumed_at, com as duas pontas incluídas', async () => {
        const march = await report(jwt, '?start=2026-03-01&end=2026-03-31');
        expect(byReason(march.body).LOSS).toBeUndefined();
        expect(byReason(march.body).STAFF.total).toBe(36);

        const april = await report(jwt, '?start=2026-04-02&end=2026-04-02');
        expect(april.body).toEqual([{ reason: 'LOSS', count: 1, total: 30 }]);
    });

    it('usa consumed_at, não created_at (lançamento que chegou depois pela fila offline)', async () => {
        // created_at é hoje; se o filtro usasse created_at, março viria vazio.
        const march = await report(jwt, '?start=2026-03-10&end=2026-03-10');
        expect(march.body.length).toBeGreaterThan(0);
    });

    it.each([
        ['só start', '?start=2026-03-01'],
        ['só end', '?end=2026-03-31'],
        ['data inválida', '?start=2026-02-30&end=2026-03-31'],
        ['formato errado', '?start=01/03/2026&end=2026-03-31'],
        ['start depois de end', '?start=2026-04-01&end=2026-03-01'],
        ['start repetido', '?start=2026-03-01&start=2026-03-02&end=2026-03-31']
    ])('400 com %s', async (_label, query) => {
        const res = await report(jwt, query);
        expect(res.status).toBe(400);
        expect(res.body.error).toBeTruthy();
    });
});

describe('GET /analytics/internal-consumption — acesso (CA-04.7.c)', () => {
    it('401 sem token', async () => {
        const res = await request(app).get(URL);
        expect(res.status).toBe(401);
    });

    it('403 para recepção', async () => {
        const res = await report(receptionistJwt);
        expect(res.status).toBe(403);
    });

    it('403 para garçom', async () => {
        const res = await report(waiterJwt);
        expect(res.status).toBe(403);
    });
});
