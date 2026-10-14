import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { QueryTypes } from 'sequelize';
import sequelize from '../database/connections/sequelize.js';
import GuestModel from '../app/Models/GuestModel.js';
import { createApp } from './helpers/createApp.js';
import { truncateAll } from './helpers/db.js';
import { registerAndLogin } from './helpers/auth.js';
import { createCategory, createRoom, createGuest } from './helpers/factories.js';

// T-01.4 / H.1 — outbox transacional (CA-01.4.a, d). O contrato é o catálogo de eventos v1.0
// (docs/specs/anexos/SPEC-01-catalogo-eventos.md): envelope (§2), eventos e payload mínimo (§4),
// ordem por agregado (§6). Os eventos são gravados por TRIGGER no banco (decisão do Gabriel,
// 14/10) — por isso os testes exercitam a API real e também SQL direto: nenhum caminho de
// escrita pode escapar.

const app = createApp();
let jwt;
let tenantId;
let catId;
let numero = 700;

const auth = () => ({ Authorization: `Bearer ${jwt}` });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const eventos = (aggregateId) => sequelize.query(
    'SELECT id, event_id, type, version, tenant_id, aggregate_id, payload, occurred_at FROM outbox WHERE aggregate_id = :aggregateId ORDER BY id',
    { replacements: { aggregateId }, type: QueryTypes.SELECT }
);
const tipos = async (aggregateId) => (await eventos(aggregateId)).map((e) => e.type);
const ultimo = async (aggregateId) => (await eventos(aggregateId)).at(-1);
const chaves = (obj) => Object.keys(obj).sort();
const novoQuarto = async () => (await createRoom(app, jwt, catId, { number: String(numero++) })).id;

beforeAll(async () => {
    await truncateAll();
    ({ jwt, tenantId } = await registerAndLogin(app, { tenantName: 'Hotel Outbox' }));
    catId = (await createCategory(app, jwt, { name: 'Standard Outbox', price_per_night: 150 })).id;
});

describe('Envelope (§2)', () => {
    it('todo evento tem event_id único, version 1, tenant_id, aggregate_id e occurred_at', async () => {
        const linhas = await sequelize.query('SELECT * FROM outbox', { type: QueryTypes.SELECT });
        expect(linhas.length).toBeGreaterThan(0);
        for (const e of linhas) {
            expect(e.event_id).toMatch(UUID);
            expect(e.version).toBe(1);
            expect(e.tenant_id).toMatch(UUID);
            expect(e.aggregate_id).toMatch(UUID);
            expect(e.occurred_at).toBeInstanceOf(Date);
            expect(e.published_at).toBeNull();
            expect(e.type).toMatch(/^[a-z_]+\.[a-z_]+$/);
        }
        expect(new Set(linhas.map((e) => e.event_id)).size).toBe(linhas.length);
    });
});

describe('Hotel — tenants (§4.1)', () => {
    it('tenant.created no cadastro, com payload só de status e tenant_id = o próprio hotel', async () => {
        const e = await ultimo(tenantId);
        expect(e.type).toBe('tenant.created');
        expect(e.tenant_id).toBe(tenantId);
        expect(e.payload).toEqual({ status: 'ACTIVE' });
    });

    it('alterar nome do hotel não gera evento; alterar status gera tenant.updated', async () => {
        const antes = (await eventos(tenantId)).length;
        await request(app).put('/tenants/me').set(auth()).send({ name: 'Hotel Outbox Renomeado' });
        expect((await eventos(tenantId)).length).toBe(antes);

        await sequelize.query(`UPDATE tenants SET status = 'SUSPENDED' WHERE id = :tenantId`, { replacements: { tenantId } });
        await sequelize.query(`UPDATE tenants SET status = 'ACTIVE' WHERE id = :tenantId`, { replacements: { tenantId } });
        const ultimos = (await eventos(tenantId)).slice(-2);
        expect(ultimos.map((e) => [e.type, e.payload.status])).toEqual([['tenant.updated', 'SUSPENDED'], ['tenant.updated', 'ACTIVE']]);
    });
});

describe('Categoria de quarto — room_categories (§4.2)', () => {
    it('created → updated só quando o nome muda → deleted; payload só com name', async () => {
        const cat = await createCategory(app, jwt, { name: 'Luxo Outbox', price_per_night: 300 });
        await request(app).put(`/room-categories/${cat.id}`).set(auth()).send({ price_per_night: 350 });
        await request(app).put(`/room-categories/${cat.id}`).set(auth()).send({ name: 'Luxo Outbox 2' });
        await request(app).delete(`/room-categories/${cat.id}`).set(auth());

        const lista = await eventos(cat.id);
        expect(lista.map((e) => e.type)).toEqual(['room_category.created', 'room_category.updated', 'room_category.deleted']);
        expect(lista[1].payload).toEqual({ name: 'Luxo Outbox 2' });
    });
});

describe('Quarto — rooms (§4.3)', () => {
    it('room.created com category_id, number e status — nada além', async () => {
        const id = await novoQuarto();
        const e = await ultimo(id);
        expect(e.type).toBe('room.created');
        expect(chaves(e.payload)).toEqual(['category_id', 'number', 'status']);
        expect(e.payload).toMatchObject({ category_id: catId, status: 'AVAILABLE' });
    });

    it('P-5: o check-in em LOTE dos quartos extras gera room.updated para cada quarto', async () => {
        const guest = await createGuest(app, jwt, { full_name: 'Hóspede Lote' });
        const principal = await novoQuarto();
        const extra = await novoQuarto();
        const r = await request(app).post('/reservations').set(auth()).send({
            guest_id: guest.id, room_id: principal, extra_room_ids: [extra], check_in_date: '2029-01-01', check_out_date: '2029-01-03',
        });
        expect(r.status).toBe(201);

        expect((await request(app).put(`/reservations/${r.body.id}/check-in`).set(auth())).status).toBe(200);

        for (const quarto of [principal, extra]) {
            const e = await ultimo(quarto);
            expect(e.type).toBe('room.updated');
            expect(e.payload.status).toBe('OCCUPIED');
        }
    });
});

describe('Hóspede — guests: minimização (§4.4)', () => {
    it('guest.created leva SÓ o nome — nem CPF, nem e-mail, nem telefone', async () => {
        const g = await createGuest(app, jwt, { full_name: 'Maria Mínima', cpf: '111.222.333-44', phone: '11999990000' });
        const e = await ultimo(g.id);
        expect(e.type).toBe('guest.created');
        expect(e.payload).toEqual({ full_name: 'Maria Mínima' });
        expect(JSON.stringify(e)).not.toMatch(/111\.222|11999990000|@/);
    });

    it('mudar telefone não gera evento; mudar o nome gera guest.updated; excluir gera guest.deleted', async () => {
        const g = await createGuest(app, jwt, { full_name: 'João Antes' });
        await request(app).put(`/guests/${g.id}`).set(auth()).send({ phone: '11888887777' });
        await request(app).put(`/guests/${g.id}`).set(auth()).send({ full_name: 'João Depois' });
        await request(app).delete(`/guests/${g.id}`).set(auth());

        const lista = await eventos(g.id);
        expect(lista.map((e) => e.type)).toEqual(['guest.created', 'guest.updated', 'guest.deleted']);
        expect(lista[1].payload).toEqual({ full_name: 'João Depois' });
    });
});

describe('Reserva — reservations (§4.5)', () => {
    let reservaId;

    it('reservation.created com os campos do catálogo; dinheiro como texto; created_at ISO UTC', async () => {
        const guest = await createGuest(app, jwt, { full_name: 'Hóspede Reserva' });
        const r = await request(app).post('/reservations').set(auth()).send({
            guest_id: guest.id, room_id: await novoQuarto(), check_in_date: '2029-02-01', check_out_date: '2029-02-03',
        });
        reservaId = r.body.id;

        const e = await ultimo(reservaId);
        expect(e.type).toBe('reservation.created');
        expect(chaves(e.payload)).toEqual(['check_in_date', 'check_out_date', 'created_at', 'guest_id', 'room_id', 'status', 'total_amount']);
        expect(e.payload).toMatchObject({ status: 'PENDING', check_in_date: '2029-02-01', check_out_date: '2029-02-03', total_amount: '300.00' });
        expect(e.payload.created_at).toMatch(ISO_UTC);
    });

    it('mudar datas gera reservation.updated (com o total recalculado)', async () => {
        await request(app).put(`/reservations/${reservaId}`).set(auth()).send({ check_out_date: '2029-02-04' });
        const lista = await eventos(reservaId);
        const atualizacoes = lista.filter((e) => e.type === 'reservation.updated');
        expect(atualizacoes.at(-1).payload).toMatchObject({ check_out_date: '2029-02-04', total_amount: '450.00' });
    });

    it('transição de estado gera reservation.status_changed com previous_status', async () => {
        await request(app).put(`/reservations/${reservaId}/check-in`).set(auth());
        const e = await ultimo(reservaId);
        expect(e.type).toBe('reservation.status_changed');
        expect(e.payload).toMatchObject({ status: 'CHECKED_IN', previous_status: 'PENDING' });
    });

    it('excluir gera reservation.deleted', async () => {
        const guest = await createGuest(app, jwt, { full_name: 'Hóspede Excluída' });
        const r = await request(app).post('/reservations').set(auth()).send({
            guest_id: guest.id, room_id: await novoQuarto(), check_in_date: '2029-03-01', check_out_date: '2029-03-02',
        });
        await request(app).delete(`/reservations/${r.body.id}`).set(auth());
        expect(await tipos(r.body.id)).toEqual(['reservation.created', 'reservation.deleted']);
    });
});

describe('Pagamento — payments (§4.6)', () => {
    it('created → status_changed (com previous_status) → deleted; sem dados do provedor; valor como texto', async () => {
        const guest = await createGuest(app, jwt, { full_name: 'Hóspede Pagamento' });
        const r = await request(app).post('/reservations').set(auth()).send({
            guest_id: guest.id, room_id: await novoQuarto(), check_in_date: '2029-04-01', check_out_date: '2029-04-02',
        });
        const p = await request(app).post('/payments').set(auth()).send({ reservation_id: r.body.id, amount: 50, method: 'DINHEIRO' });
        expect(p.status).toBe(201);

        const criado = await ultimo(p.body.id);
        expect(criado.type).toBe('payment.created');
        expect(chaves(criado.payload)).toEqual(['amount', 'method', 'paid_at', 'reservation_id', 'status']);
        expect(criado.payload).toMatchObject({ amount: '50.00', method: 'DINHEIRO', status: 'PAID', reservation_id: r.body.id });
        expect(criado.payload.paid_at).toMatch(ISO_UTC);

        await sequelize.query(`UPDATE payments SET status = 'FAILED' WHERE id = :id`, { replacements: { id: p.body.id } });
        const mudou = await ultimo(p.body.id);
        expect(mudou.type).toBe('payment.status_changed');
        expect(mudou.payload).toMatchObject({ status: 'FAILED', previous_status: 'PAID' });

        await request(app).delete(`/payments/${p.body.id}`).set(auth());
        expect((await ultimo(p.body.id)).type).toBe('payment.deleted');
    });
});

describe('O que não gera evento (§4.7)', () => {
    it('usuários, produtos e quartos extras (reservation_rooms) não entram no outbox', async () => {
        const antes = await sequelize.query('SELECT count(*)::int AS n FROM outbox', { type: QueryTypes.SELECT });
        await request(app).post('/products').set(auth()).send({ name: 'Água Outbox', price: 5, category: 'DRINK' });
        await request(app).post('/users').set(auth()).send({ name: 'Recepção', email: `rec_outbox_${Date.now()}@t.test`, password: 'senha123', role: 'RECEPTIONIST' });
        const depois = await sequelize.query('SELECT count(*)::int AS n FROM outbox', { type: QueryTypes.SELECT });
        expect(depois[0].n).toBe(antes[0].n);
    });
});

describe('Atomicidade e ordem (CA-01.4.a, §6)', () => {
    it('transação desfeita não deixa evento', async () => {
        const antes = await sequelize.query('SELECT count(*)::int AS n FROM outbox', { type: QueryTypes.SELECT });
        const t = await sequelize.transaction();
        await GuestModel.create({ tenant_id: tenantId, full_name: 'Nunca Existiu' }, { transaction: t });
        await t.rollback();
        const depois = await sequelize.query('SELECT count(*)::int AS n FROM outbox', { type: QueryTypes.SELECT });
        expect(depois[0].n).toBe(antes[0].n);
    });

    it('requisição recusada (409 de ocupação) não deixa evento de reserva', async () => {
        const guest = await createGuest(app, jwt, { full_name: 'Hóspede Recusada' });
        const quarto = await novoQuarto();
        const datas = { check_in_date: '2029-05-01', check_out_date: '2029-05-03' };
        expect((await request(app).post('/reservations').set(auth()).send({ guest_id: guest.id, room_id: quarto, ...datas })).status).toBe(201);
        const antes = await sequelize.query(`SELECT count(*)::int AS n FROM outbox WHERE type LIKE 'reservation.%'`, { type: QueryTypes.SELECT });

        expect((await request(app).post('/reservations').set(auth()).send({ guest_id: guest.id, room_id: quarto, ...datas })).status).toBe(409);

        const depois = await sequelize.query(`SELECT count(*)::int AS n FROM outbox WHERE type LIKE 'reservation.%'`, { type: QueryTypes.SELECT });
        expect(depois[0].n).toBe(antes[0].n);
    });

    it('duas alterações concorrentes do mesmo registro: aggregate_version segue a ordem de COMMIT', async () => {
        const g = await createGuest(app, jwt, { full_name: 'Concorrência 0' });

        const t1 = await sequelize.transaction();
        await sequelize.query(`UPDATE guests SET full_name = 'Concorrência 1' WHERE id = :id`, { replacements: { id: g.id }, transaction: t1 });

        const t2 = await sequelize.transaction();
        const segunda = sequelize.query(`UPDATE guests SET full_name = 'Concorrência 2' WHERE id = :id`, { replacements: { id: g.id }, transaction: t2 });
        await new Promise((ok) => setTimeout(ok, 300));
        await t1.commit();
        await segunda;
        await t2.commit();

        const lista = (await eventos(g.id)).filter((e) => e.type === 'guest.updated');
        expect(lista.map((e) => e.payload.full_name)).toEqual(['Concorrência 1', 'Concorrência 2']);
        expect(Number(lista[1].id)).toBeGreaterThan(Number(lista[0].id));
    });
});
