import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from './helpers/createApp.js';
import { truncateAll } from './helpers/db.js';
import { registerAndLogin } from './helpers/auth.js';
import { createCategory, createRoom, createGuest, createReservation } from './helpers/factories.js';
import AccountItemModel from '../app/Models/AccountItemModel.js';

// M5-c, CA-05.2.j (RT-18): o bill da reserva mostra o consumo estornado e quem autorizou.
// Estorno de consumo = exclusão lógica do item, só ADMIN, com deleted_by (D-7, D-8).
// O item estornado nunca soma: aparece como histórico, como o pagamento VOIDED (CA-06.13.g).

const app = createApp();
const auth = (token) => ({ Authorization: `Bearer ${token}` });
let jwt;
let tenantId;
let reservationId;
let accountId;
let manager;

async function createAdmin(name) {
    const email = `gerente_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@test.com`;
    const created = await request(app).post('/users').set(auth(jwt)).send({ name, email, password: 'senha123', role: 'ADMIN' });
    if (created.status !== 201) throw new Error(`usuário: ${created.status} ${JSON.stringify(created.body)}`);
    const login = await request(app).post('/auth/login').send({ email, password: 'senha123' });
    return { id: created.body.id, token: login.body.token };
}

async function addItem(body) {
    const res = await request(app).post(`/accounts/${accountId}/items`).set(auth(jwt)).send(body);
    if (res.status !== 201) throw new Error(`item: ${res.status} ${JSON.stringify(res.body)}`);
    return res.body.item ?? res.body;
}

const voidItem = (itemId, token = jwt) =>
    request(app).delete(`/accounts/${accountId}/items/${itemId}`).set(auth(token));
const getBill = (token = jwt) => request(app).get(`/reservations/${reservationId}/bill`).set(auth(token));

beforeAll(async () => {
    await truncateAll();
    ({ jwt, tenantId } = await registerAndLogin(app, { tenantName: 'Hotel Estorno Visível' }));
    const cat = await createCategory(app, jwt, { price_per_night: 200 });
    const room = await createRoom(app, jwt, cat.id, { number: '701' });
    const guest = await createGuest(app, jwt, { full_name: 'Carla Estorno' });
    const today = new Date().toLocaleDateString('sv-SE');
    const out = new Date(Date.now() + 2 * 86400000).toLocaleDateString('sv-SE');
    const reservation = await createReservation(app, jwt, guest.id, room.id, { check_in_date: today, check_out_date: out });
    reservationId = reservation.id;
    const checkIn = await request(app).put(`/reservations/${reservationId}/check-in`).set(auth(jwt));
    expect(checkIn.status).toBe(200);
    const accounts = await request(app).get(`/reservations/${reservationId}/accounts`).set(auth(jwt));
    accountId = (accounts.body.data ?? accounts.body)[0].id;
    manager = await createAdmin('Marta Gerente');
});

describe('GET /reservations/:id/bill — voided_consumptions (CA-05.2.j)', () => {
    let kept;
    let voided;

    beforeAll(async () => {
        kept = await addItem({ description: 'Água', quantity: 1, unit_price: '10.00' });
        voided = await addItem({ description: 'Vinho lançado por engano', quantity: 1, unit_price: '120.00' });
        expect((await voidItem(voided.id, manager.token)).status).toBe(204);
    });

    it('lista o consumo estornado com quem autorizou (id e nome)', async () => {
        const res = await getBill();
        expect(res.status).toBe(200);
        expect(res.body.voided_consumptions).toHaveLength(1);
        const [entry] = res.body.voided_consumptions;
        expect(entry).toMatchObject({
            id: voided.id,
            description: 'Vinho lançado por engano',
            amount: 120,
            deleted_by: { id: manager.id, name: 'Marta Gerente' },
        });
        expect(entry.consumed_at).toBeTruthy();
        expect(entry.deleted_at).toBeTruthy();
    });

    it('de quem autorizou, só id e nome: sem e-mail, papel ou senha', async () => {
        const [entry] = (await getBill()).body.voided_consumptions;
        expect(Object.keys(entry.deleted_by).sort()).toEqual(['id', 'name']);
    });

    it('o estornado não soma: totais e lista de consumos só com o item vivo', async () => {
        const bill = (await getBill()).body;
        expect(bill.consumptions.map((c) => c.id)).toEqual([kept.id]);
        expect(bill.consumptions_total).toBe(10);
        expect(bill.grand_total).toBe(bill.room_total + 10);
        expect(bill.balance_due).toBe(bill.grand_total - bill.total_paid);
    });

    it('cortesia estornada não aparece: nunca foi cobrada (D-70)', async () => {
        const courtesy = await addItem({ description: 'Café cortesia', quantity: 1, unit_price: '8.00', billable: false, reason: 'COURTESY' });
        expect((await voidItem(courtesy.id)).status).toBe(204);
        const ids = (await getBill()).body.voided_consumptions.map((v) => v.id);
        expect(ids).not.toContain(courtesy.id);
    });

    it('quem autorizou continua com nome depois de removido do sistema (D-71)', async () => {
        const other = await createAdmin('Paulo Temporário');
        const item = await addItem({ description: 'Toalha extra', quantity: 1, unit_price: '15.00' });
        expect((await voidItem(item.id, other.token)).status).toBe(204);
        expect((await request(app).delete(`/users/${other.id}`).set(auth(jwt))).status).toBeLessThan(300);

        const entry = (await getBill()).body.voided_consumptions.find((v) => v.id === item.id);
        expect(entry.deleted_by).toEqual({ id: other.id, name: 'Paulo Temporário' });
    });

    it('estorno antigo sem deleted_by (consumo migrado): deleted_by nulo, sem quebrar o bill', async () => {
        const item = await addItem({ description: 'Lavanderia', quantity: 1, unit_price: '30.00' });
        expect((await voidItem(item.id)).status).toBe(204);
        await AccountItemModel.update({ deleted_by: null }, { where: { id: item.id }, paranoid: false });

        const res = await getBill();
        expect(res.status).toBe(200);
        expect(res.body.voided_consumptions.find((v) => v.id === item.id).deleted_by).toBeNull();
    });

    it('em ordem de estorno, o mais antigo primeiro', async () => {
        const list = (await getBill()).body.voided_consumptions;
        const times = list.map((v) => new Date(v.deleted_at).getTime());
        expect(times).toEqual([...times].sort((a, b) => a - b));
    });

    it('outro hotel não lê o bill (404) nem enxerga o estorno', async () => {
        const { jwt: otherJwt } = await registerAndLogin(app, { tenantName: 'Hotel Vizinho Estorno' });
        const res = await getBill(otherJwt);
        expect(res.status).toBe(404);
        expect(JSON.stringify(res.body)).not.toContain('Vinho');
    });

    it('reserva sem estorno devolve lista vazia, não ausente', async () => {
        const cat = await createCategory(app, jwt, { name: 'Simples', price_per_night: 100 });
        const room = await createRoom(app, jwt, cat.id, { number: '702' });
        const guest = await createGuest(app, jwt, { full_name: 'Sem Estorno' });
        const r = await createReservation(app, jwt, guest.id, room.id, { check_in_date: '2027-05-01', check_out_date: '2027-05-02' });
        const res = await request(app).get(`/reservations/${r.id}/bill`).set(auth(jwt));
        expect(res.body.voided_consumptions).toEqual([]);
    });

    it('tenant_id: o estorno listado é deste hotel', async () => {
        const ids = (await getBill()).body.voided_consumptions.map((v) => v.id);
        const rows = await AccountItemModel.findAll({ where: { id: ids }, paranoid: false });
        expect(rows.every((r) => r.tenant_id === tenantId)).toBe(true);
    });
});
