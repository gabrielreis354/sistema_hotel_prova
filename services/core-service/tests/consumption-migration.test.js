// T-04.2 — consumo antigo passa a viver em contas (SPEC-04 §5, CA-04.2.a–e).
//
// Duas partes:
//   1. As rotas antigas /reservations/:id/consumptions continuam com o mesmo contrato,
//      gravando e lendo via Account (CA-04.2.d). O tests/bill-consumptions.test.js é o
//      contrato protegido (CA-04.2.e) e NÃO é editado; aqui ficam os casos novos.
//   2. A migração dos dados que já estão em `consumptions` (CA-04.2.a–c).
//
// O model ConsumptionModel saiu do código (D-27), então o banco de teste não cria a
// tabela antiga: ela é criada aqui com o DDL de db/schema.sql e removida no fim, para
// não vazar para os outros arquivos de teste.
import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import sequelize from '../database/connections/sequelize.js';
import { createApp } from './helpers/createApp.js';
import { truncateAll } from './helpers/db.js';
import { registerAndLogin } from './helpers/auth.js';
import { createCategory, createRoom, createGuest, createReservation } from './helpers/factories.js';
import AccountModel from '../app/Models/AccountModel.js';
import AccountItemModel from '../app/Models/AccountItemModel.js';

// Import tardio: sem o módulo, só os testes da migração falham — não o arquivo inteiro.
async function migrateConsumptions(db) {
    const { default: migrate } = await import('../database/migrateConsumptions.js');
    return migrate(db);
}

const app = createApp();
const auth = (token) => ({ Authorization: `Bearer ${token}` });

let jwt, tenantId, userId;
let otherTenantId;
let category;
let roomNumber = 700;

async function newReservation({ checkIn = false } = {}) {
    roomNumber += 1;
    const room = await createRoom(app, jwt, category.id, { number: String(roomNumber) });
    const guest = await createGuest(app, jwt, { email: `consumo_${roomNumber}_${Date.now()}@test.com` });
    const reservation = await createReservation(app, jwt, guest.id, room.id, {
        check_in_date: `2028-0${(roomNumber % 9) + 1}-01`, check_out_date: `2028-0${(roomNumber % 9) + 1}-03`
    });
    if (checkIn) await request(app).put(`/reservations/${reservation.id}/check-in`).set(auth(jwt));
    return { reservation, room, guest };
}

const postConsumption = (reservationId, body) =>
    request(app).post(`/reservations/${reservationId}/consumptions`).set(auth(jwt)).send(body);

const getBill = (reservationId) =>
    request(app).get(`/reservations/${reservationId}/bill`).set(auth(jwt));

async function insertLegacy(over) {
    const v = {
        id: randomUUID(), tenant_id: tenantId, description: 'Frigobar', amount: 10,
        consumed_at: '2026-08-01T12:00:00Z', created_at: '2026-08-01T12:00:00Z',
        deleted_at: null, deleted_by: null, ...over
    };
    await sequelize.query(
        `INSERT INTO consumptions (id, tenant_id, reservation_id, description, amount, consumed_at,
                                   deleted_by, deleted_at, created_at, updated_at)
         VALUES (:id, :tenant_id, :reservation_id, :description, :amount, :consumed_at,
                 :deleted_by, :deleted_at, :created_at, :created_at)`,
        { replacements: v }
    );
    return v.id;
}

beforeAll(async () => {
    await truncateAll();
    ({ jwt, tenantId, userId } = await registerAndLogin(app, { tenantName: 'Hotel Consumo' }));
    ({ tenantId: otherTenantId } = await registerAndLogin(app, { tenantName: 'Hotel Consumo Vizinho' }));
    category = await createCategory(app, jwt, { name: 'Std Consumo', price_per_night: 100 });

    // DDL de db/schema.sql (tabela legada).
    await sequelize.query('DROP TABLE IF EXISTS consumptions');
    await sequelize.query(`
        CREATE TABLE consumptions (
          id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          reservation_id UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
          description    TEXT NOT NULL,
          amount         NUMERIC(12, 2) NOT NULL,
          consumed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
          deleted_by     UUID REFERENCES users(id),
          deleted_at     TIMESTAMPTZ,
          created_at     TIMESTAMPTZ DEFAULT now(),
          updated_at     TIMESTAMPTZ DEFAULT now(),
          CHECK (amount >= 0)
        )`);
});

afterAll(async () => {
    await sequelize.query('DROP TABLE IF EXISTS consumptions');
});

describe('Rotas antigas gravam e leem via conta (CA-04.2.d)', () => {
    it('POST em reserva sem check-in cria a conta da suíte (D-28) e devolve o formato antigo', async () => {
        const { reservation, room, guest } = await newReservation();

        const res = await postConsumption(reservation.id, { description: 'Frigobar', amount: 50 });

        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({ reservation_id: reservation.id, description: 'Frigobar', tenant_id: tenantId });
        expect(Number(res.body.amount)).toBe(50);
        expect(res.body.consumed_at).toBeTruthy();

        const accounts = await AccountModel.findAll({ where: { reservation_id: reservation.id } });
        expect(accounts).toHaveLength(1);
        expect(accounts[0]).toMatchObject({
            type: 'ROOM', status: 'OPEN', room_id: room.id, guest_id: guest.id,
            charges_lodging: true, label: `Suíte ${room.number}`
        });

        const item = await AccountItemModel.findByPk(res.body.id);
        expect(item).toMatchObject({ quantity: 1, total: '50.00', origin: 'ACCOUNT', created_by: userId });
    });

    it('segundo consumo reusa a mesma conta', async () => {
        const { reservation } = await newReservation();
        await postConsumption(reservation.id, { description: 'A', amount: 1 });
        await postConsumption(reservation.id, { description: 'B', amount: 2 });

        expect(await AccountModel.count({ where: { reservation_id: reservation.id } })).toBe(1);
    });

    it('reusa a conta da suíte que já cobra a diária (aberta por /accounts)', async () => {
        const { reservation, room, guest } = await newReservation({ checkIn: true });
        const opened = await request(app).post('/accounts').set(auth(jwt)).send({
            type: 'ROOM', reservation_id: reservation.id, room_id: room.id, guest_id: guest.id, label: 'Suíte da recepção'
        });
        expect(opened.status).toBe(201);

        const res = await postConsumption(reservation.id, { description: 'Spa', amount: 90 });

        expect(res.status).toBe(201);
        const item = await AccountItemModel.findByPk(res.body.id);
        expect(item.account_id).toBe(opened.body.id);
    });

    it('consumed_at enviado é preservado no POST, na lista e no bill (D-26)', async () => {
        const { reservation } = await newReservation();
        const consumedAt = '2026-01-01T20:00:00.000Z';

        const res = await postConsumption(reservation.id, { description: 'Jantar', amount: 80, consumed_at: consumedAt });
        const list = await request(app).get(`/reservations/${reservation.id}/consumptions`).set(auth(jwt));
        const bill = await getBill(reservation.id);

        expect(new Date(res.body.consumed_at).toISOString()).toBe(consumedAt);
        expect(new Date(list.body[0].consumed_at).toISOString()).toBe(consumedAt);
        expect(new Date(bill.body.consumptions[0].consumed_at).toISOString()).toBe(consumedAt);
    });

    it.each([
        ['consumed_at inválido', { description: 'X', amount: 10, consumed_at: 'ontem' }],
        ['amount acima da coluna', { description: 'X', amount: 100000000 }],
        ['consumed_at no futuro', { description: 'X', amount: 10, consumed_at: '2099-01-01T00:00:00Z' }]
    ])('%s → 400', async (_, body) => {
        const { reservation } = await newReservation();
        const res = await postConsumption(reservation.id, body);
        expect(res.status).toBe(400);
    });

    it('GET lista no formato antigo, em ordem de consumo, sem cortesia', async () => {
        const { reservation } = await newReservation();
        await postConsumption(reservation.id, { description: 'Segundo', amount: 2, consumed_at: '2026-01-02T10:00:00Z' });
        const first = await postConsumption(reservation.id, { description: 'Primeiro', amount: 1, consumed_at: '2026-01-01T10:00:00Z' });

        // Cortesia lançada pela API nova na mesma conta: não é consumo cobrado.
        const accountId = (await AccountItemModel.findByPk(first.body.id)).account_id;
        await AccountItemModel.create({
            tenant_id: tenantId, account_id: accountId, description: 'Cortesia', quantity: 1,
            unit_price: 30, total: 30, billable: false, reason: 'COURTESY', created_by: userId
        });

        const res = await request(app).get(`/reservations/${reservation.id}/consumptions`).set(auth(jwt));

        expect(res.status).toBe(200);
        expect(res.body.map(c => c.description)).toEqual(['Primeiro', 'Segundo']);
        expect(Object.keys(res.body[0]).sort()).toEqual(
            ['amount', 'consumed_at', 'created_at', 'deleted_at', 'deleted_by', 'description', 'id', 'reservation_id', 'tenant_id', 'updated_at']
        );

        const bill = await getBill(reservation.id);
        expect(bill.body.consumptions_total).toBe(3);
    });

    it('DELETE de item de outra reserva → 404', async () => {
        const a = await newReservation();
        const b = await newReservation();
        const created = await postConsumption(a.reservation.id, { description: 'X', amount: 5 });

        const res = await request(app)
            .delete(`/reservations/${b.reservation.id}/consumptions/${created.body.id}`)
            .set(auth(jwt));

        expect(res.status).toBe(404);
    });
});

describe('Migração de consumptions para account_items (CA-04.2.a–c)', () => {
    let r1, r2, c1, c2, c3;

    beforeAll(async () => {
        r1 = await newReservation();
        r2 = await newReservation({ checkIn: true });
        // r2 já tem a conta que cobra a diária: a migração tem que reusá-la.
        await request(app).post('/accounts').set(auth(jwt)).send({
            type: 'ROOM', reservation_id: r2.reservation.id, room_id: r2.room.id, guest_id: r2.guest.id, label: 'Suíte r2'
        });

        c1 = await insertLegacy({ reservation_id: r1.reservation.id, amount: 50,
            created_at: '2026-08-01T10:00:00Z', consumed_at: '2026-08-01T09:30:00Z' });
        c2 = await insertLegacy({ reservation_id: r1.reservation.id, amount: 20.5,
            deleted_at: '2026-08-02T10:00:00Z', deleted_by: userId });
        c3 = await insertLegacy({ reservation_id: r2.reservation.id, amount: 15 });
    });

    it('migra cada consumo para um item com o mesmo id, sem perda de valor (a, b, c)', async () => {
        const summary = await migrateConsumptions(sequelize);
        expect(summary).toMatchObject({ items: 3 });

        const i1 = await AccountItemModel.findByPk(c1, { paranoid: false });
        expect(i1).toMatchObject({
            quantity: 1, unit_price: '50.00', total: '50.00', billable: true,
            origin: 'LEGACY_CONSUMPTION', created_by: null, description: 'Frigobar'
        });
        expect(i1.created_at.toISOString()).toBe('2026-08-01T10:00:00.000Z');
        expect(i1.consumed_at.toISOString()).toBe('2026-08-01T09:30:00.000Z');

        const i2 = await AccountItemModel.findByPk(c2, { paranoid: false });
        expect(i2.deleted_at.toISOString()).toBe('2026-08-02T10:00:00.000Z');
        expect(i2.deleted_by).toBe(userId);
        expect(i2.total).toBe('20.50');
    });

    it('cria uma conta da suíte por reserva e reusa a que já cobra a diária', async () => {
        const a1 = await AccountModel.findAll({ where: { reservation_id: r1.reservation.id } });
        expect(a1).toHaveLength(1);
        expect(a1[0]).toMatchObject({ type: 'ROOM', status: 'OPEN', charges_lodging: true, label: `Suíte ${r1.room.number}` });

        expect(await AccountModel.count({ where: { reservation_id: r2.reservation.id } })).toBe(1);
        const i3 = await AccountItemModel.findByPk(c3);
        const a2 = await AccountModel.findOne({ where: { reservation_id: r2.reservation.id } });
        expect(i3.account_id).toBe(a2.id);
    });

    it('o bill enxerga os consumos migrados, sem o excluído', async () => {
        const res = await getBill(r1.reservation.id);
        expect(res.body.consumptions_total).toBe(50);
        expect(res.body.consumptions.map(c => c.id)).toEqual([c1]);
    });

    it('o DELETE antigo funciona com o id antigo', async () => {
        const res = await request(app).delete(`/reservations/${r2.reservation.id}/consumptions/${c3}`).set(auth(jwt));
        expect(res.status).toBe(204);
    });

    it('é idempotente: rodar de novo não cria nada', async () => {
        const before = await AccountItemModel.count({ paranoid: false });
        const summary = await migrateConsumptions(sequelize);

        expect(summary).toMatchObject({ accounts: 0, items: 0 });
        expect(await AccountItemModel.count({ paranoid: false })).toBe(before);
    });

    it('valor acima da coluna nova aborta tudo, sem migrar pela metade', async () => {
        const r = await newReservation();
        const ok = await insertLegacy({ reservation_id: r.reservation.id, amount: 5 });
        const bad = await insertLegacy({ reservation_id: r.reservation.id, amount: 100000000 });

        await expect(migrateConsumptions(sequelize)).rejects.toThrow(/99999999\.99/);
        expect(await AccountItemModel.findByPk(ok)).toBeNull();
        expect(await AccountModel.count({ where: { reservation_id: r.reservation.id } })).toBe(0);

        await sequelize.query('DELETE FROM consumptions WHERE id IN (:ids)', { replacements: { ids: [ok, bad] } });
    });

    it('consumo com hotel diferente do da reserva aborta', async () => {
        const r = await newReservation();
        const bad = await insertLegacy({ reservation_id: r.reservation.id, tenant_id: otherTenantId });

        await expect(migrateConsumptions(sequelize)).rejects.toThrow(/hotel diferente do da reserva/);

        await sequelize.query('DELETE FROM consumptions WHERE id = :bad', { replacements: { bad } });
    });

    it('sem a tabela antiga, não faz nada', async () => {
        await sequelize.query('DROP TABLE consumptions');
        await expect(migrateConsumptions(sequelize)).resolves.toMatchObject({ skipped: true });
    });
});
