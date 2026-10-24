/**
 * Regras de cadastro de quartos e categorias — R-2 a R-6 do repasse do qa-redteam de
 * 21/10/2026 (docs/qa/repasses/para_sirlande_21102026.md). Área da Sirlande.
 *
 * Máquina de estados do quarto (CLAUDE.md §3): OCCUPIED só pelo check-in e CLEANING só pelo
 * check-out. Pela edição manual (PUT /rooms/:id) sobram AVAILABLE ↔ MAINTENANCE e
 * CLEANING → AVAILABLE (limpeza concluída). Reenviar o status atual não é transição.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from './helpers/createApp.js';
import { truncateAll } from './helpers/db.js';
import { registerAndLogin } from './helpers/auth.js';
import { createCategory, createGuest, createReservation } from './helpers/factories.js';
import RoomModel from '../app/Models/RoomModel.js';
import ReservationModel from '../app/Models/ReservationModel.js';

const app = createApp();
let jwt;
let categoryId;
let seq = 0;

const auth = () => ({ Authorization: `Bearer ${jwt}` });
const nextNumber = () => `R${++seq}`;

// Contrato de erro combinado com o frontend (T-05.1): status + `code` estável, e `field` no 400.
function expectError(res, status, code, field) {
    expect(res.status).toBe(status);
    expect(res.body.code).toBe(code);
    expect(typeof res.body.error).toBe('string');
    if (field) expect(res.body.field).toBe(field);
}

async function newRoom(overrides = {}) {
    const res = await request(app).post('/rooms').set(auth())
        .send({ category_id: categoryId, number: nextNumber(), floor: 1, ...overrides });
    return res;
}

// Coloca o quarto num status que só o check-in/check-out produzem, sem passar por eles.
async function roomWithStatus(status) {
    const room = (await newRoom()).body;
    await RoomModel.update({ status }, { where: { id: room.id } });
    return room;
}

beforeAll(async () => {
    await truncateAll();
    ({ jwt } = await registerAndLogin(app, { tenantName: 'Hotel Regras Quartos' }));
    categoryId = (await createCategory(app, jwt, { name: 'Base', price_per_night: '120.00' })).id;
});

describe('R-2 — andar 0 (térreo) é preservado', () => {
    it('POST /rooms com floor: 0 grava 0, não null', async () => {
        const res = await newRoom({ floor: 0 });
        expect(res.status).toBe(201);
        expect(res.body.floor).toBe(0);
    });

    it('POST /rooms sem floor continua gravando null', async () => {
        const res = await newRoom({ floor: undefined });
        expect(res.status).toBe(201);
        expect(res.body.floor).toBeNull();
    });

    it('floor que não é inteiro → 400, nunca 500', async () => {
        expectError(await newRoom({ floor: 'abc' }), 400, 'INVALID_INPUT', 'floor');
        expectError(await newRoom({ floor: 1.5 }), 400, 'INVALID_INPUT', 'floor');
        expectError(await newRoom({ floor: 99999999999 }), 400, 'INVALID_INPUT', 'floor');

        const room = (await newRoom()).body;
        const put = await request(app).put(`/rooms/${room.id}`).set(auth()).send({ floor: 'abc' });
        expectError(put, 400, 'INVALID_INPUT', 'floor');
    });
});

describe('R-3 — status em allowlist no cadastro', () => {
    it('sem status nasce AVAILABLE', async () => {
        const res = await newRoom();
        expect(res.status).toBe(201);
        expect(res.body.status).toBe('AVAILABLE');
    });

    it('aceita MAINTENANCE no cadastro', async () => {
        const res = await newRoom({ status: 'MAINTENANCE' });
        expect(res.status).toBe(201);
        expect(res.body.status).toBe('MAINTENANCE');
    });

    it.each(['FOO', 'OCCUPIED', 'CLEANING'])('recusa status %s no cadastro (400)', async (status) => {
        const res = await newRoom({ status });
        expectError(res, 400, 'INVALID_INPUT', 'status');
    });

    it('campos obrigatórios ausentes → 400 INVALID_INPUT, mantendo a lista errors', async () => {
        const res = await request(app).post('/rooms').set(auth()).send({});
        expectError(res, 400, 'INVALID_INPUT', 'category_id');
        expect(res.body.errors).toEqual(expect.arrayContaining(['category_id obrigatório', 'number obrigatório']));
    });
});

describe('R-3 — transição de status validada na edição', () => {
    it.each([
        ['AVAILABLE', 'MAINTENANCE'],
        ['MAINTENANCE', 'AVAILABLE'],
        ['CLEANING', 'AVAILABLE']
    ])('%s → %s pela edição manual (200)', async (from, to) => {
        const room = await roomWithStatus(from);
        const res = await request(app).put(`/rooms/${room.id}`).set(auth()).send({ status: to });
        expect(res.status).toBe(200);
        expect(res.body.status).toBe(to);
    });

    it.each([
        ['OCCUPIED', 'AVAILABLE'],
        ['OCCUPIED', 'MAINTENANCE'],
        ['OCCUPIED', 'CLEANING'],
        ['AVAILABLE', 'OCCUPIED'],
        ['AVAILABLE', 'CLEANING'],
        ['MAINTENANCE', 'OCCUPIED'],
        ['CLEANING', 'OCCUPIED']
    ])('%s → %s pela edição manual é recusado (409), e o status não muda', async (from, to) => {
        const room = await roomWithStatus(from);
        const res = await request(app).put(`/rooms/${room.id}`).set(auth()).send({ status: to });
        expectError(res, 409, 'ROOM_STATUS_TRANSITION_NOT_ALLOWED');
        expect((await RoomModel.findByPk(room.id)).status).toBe(from);
    });

    it('quarto OCCUPIED liberado à mão não volta para /rooms/available', async () => {
        const room = await roomWithStatus('OCCUPIED');
        await request(app).put(`/rooms/${room.id}`).set(auth()).send({ status: 'AVAILABLE' });
        const res = await request(app).get('/rooms/available?check_in=2028-01-01&check_out=2028-01-02').set(auth());
        expect(res.body.map((r) => r.id)).not.toContain(room.id);
    });

    it('reenviar o status atual não é transição: editar o número de um quarto OCCUPIED → 200', async () => {
        const room = await roomWithStatus('OCCUPIED');
        const res = await request(app).put(`/rooms/${room.id}`).set(auth()).send({ number: nextNumber(), status: 'OCCUPIED' });
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('OCCUPIED');
    });

    it('status fora da lista continua 400', async () => {
        const room = (await newRoom()).body;
        const res = await request(app).put(`/rooms/${room.id}`).set(auth()).send({ status: 'FOO' });
        expectError(res, 400, 'INVALID_INPUT', 'status');
    });
});

describe('Unicidade no hotel — code estável nos 409 que já existiam', () => {
    it('número de quarto repetido → 409 ROOM_NUMBER_TAKEN (cadastro e edição)', async () => {
        const number = nextNumber();
        await newRoom({ number });
        expectError(await newRoom({ number }), 409, 'ROOM_NUMBER_TAKEN');

        const other = (await newRoom()).body;
        const put = await request(app).put(`/rooms/${other.id}`).set(auth()).send({ number });
        expectError(put, 409, 'ROOM_NUMBER_TAKEN');
    });

    it('nome de categoria repetido → 409 CATEGORY_NAME_TAKEN (cadastro e edição)', async () => {
        await createCategory(app, jwt, { name: 'Repetida', price_per_night: '100.00' });
        const dup = await request(app).post('/room-categories').set(auth()).send({ name: 'Repetida', price_per_night: '100.00' });
        expectError(dup, 409, 'CATEGORY_NAME_TAKEN');

        const other = await createCategory(app, jwt, { name: 'Outra única', price_per_night: '100.00' });
        const put = await request(app).put(`/room-categories/${other.id}`).set(auth()).send({ name: 'Repetida' });
        expectError(put, 409, 'CATEGORY_NAME_TAKEN');
    });
});

describe('R-4 — excluir categoria em uso', () => {
    it('categoria com quarto vivo → 409, e ela continua lá', async () => {
        const cat = await createCategory(app, jwt, { name: 'Usada', price_per_night: '200.00' });
        await newRoom({ category_id: cat.id });

        const res = await request(app).delete(`/room-categories/${cat.id}`).set(auth());
        expectError(res, 409, 'CATEGORY_IN_USE');
        expect((await request(app).get(`/room-categories/${cat.id}`).set(auth())).status).toBe(200);
    });

    it('categoria só com quartos excluídos → 204', async () => {
        const cat = await createCategory(app, jwt, { name: 'Ex-usada', price_per_night: '200.00' });
        const room = (await newRoom({ category_id: cat.id })).body;
        await request(app).delete(`/rooms/${room.id}`).set(auth());

        const res = await request(app).delete(`/room-categories/${cat.id}`).set(auth());
        expect(res.status).toBe(204);
    });

    it('categoria sem quarto → 204', async () => {
        const cat = await createCategory(app, jwt, { name: 'Vazia', price_per_night: '200.00' });
        expect((await request(app).delete(`/room-categories/${cat.id}`).set(auth())).status).toBe(204);
    });
});

describe('R-5 — diária e capacidade da categoria', () => {
    const post = (body) => request(app).post('/room-categories').set(auth())
        .send({ name: `Cat ${nextNumber()}`, capacity: 2, price_per_night: '100.00', ...body });

    it.each([
        ['negativa', '-10.00'],
        ['zero', '0'],
        ['texto', 'abc'],
        ['acima de DECIMAL(10,2)', '100000000.00'],
        ['com 3 casas', '10.999'],
        ['vírgula', '12,50']
    ])('POST com diária %s → 400', async (_caso, price) => {
        expectError(await post({ price_per_night: price }), 400, 'INVALID_INPUT', 'price_per_night');
    });

    it.each([
        ['negativa', -3],
        ['zero', 0],
        ['fracionária', 2.5],
        ['texto', 'abc'],
        ['acima de INTEGER', 99999999999]
    ])('POST com capacidade %s → 400', async (_caso, capacity) => {
        expectError(await post({ capacity }), 400, 'INVALID_INPUT', 'capacity');
    });

    it('POST com name que não é texto → 400, nunca 500', async () => {
        expectError(await post({ name: { a: 1 } }), 400, 'INVALID_INPUT', 'name');
        expectError(await post({ name: '   ' }), 400, 'INVALID_INPUT', 'name');
    });

    it('POST válido continua 201, com diária em string e sem capacidade vira 1', async () => {
        const res = await post({ price_per_night: 150.5, capacity: undefined });
        expect(res.status).toBe(201);
        expect(res.body.price_per_night).toBe('150.50');
        expect(res.body.capacity).toBe(1);
    });

    it('PUT com diária negativa, capacidade negativa, texto ou estouro → 400, e nada é gravado', async () => {
        const cat = (await post({})).body;
        const put = (body) => request(app).put(`/room-categories/${cat.id}`).set(auth()).send(body);

        const both = await put({ price_per_night: '-50.00', capacity: -3 });
        expectError(both, 400, 'INVALID_INPUT', 'price_per_night');
        expect(both.body.errors).toHaveLength(2);
        expectError(await put({ price_per_night: '-50.00' }), 400, 'INVALID_INPUT', 'price_per_night');
        expectError(await put({ capacity: -3 }), 400, 'INVALID_INPUT', 'capacity');
        expectError(await put({ price_per_night: 'abc' }), 400, 'INVALID_INPUT', 'price_per_night');
        expectError(await put({ price_per_night: '100000000.00' }), 400, 'INVALID_INPUT', 'price_per_night');
        expectError(await put({ name: '' }), 400, 'INVALID_INPUT', 'name');

        const get = await request(app).get(`/room-categories/${cat.id}`).set(auth());
        expect(get.body).toMatchObject({ price_per_night: '100.00', capacity: 2 });
    });

    it('PUT válido continua 200', async () => {
        const cat = (await post({})).body;
        const res = await request(app).put(`/room-categories/${cat.id}`).set(auth()).send({ price_per_night: '180.00', capacity: 3 });
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ price_per_night: '180.00', capacity: 3 });
    });
});

describe('R-6 — excluir quarto ocupado ou com reserva ativa', () => {
    let guestId;
    beforeAll(async () => {
        guestId = (await createGuest(app, jwt, { email: 'r6@regras.test' })).id;
    });

    it('quarto OCCUPIED → 409, e ele continua lá', async () => {
        const room = await roomWithStatus('OCCUPIED');
        const res = await request(app).delete(`/rooms/${room.id}`).set(auth());
        expectError(res, 409, 'ROOM_IN_USE');
        expect((await request(app).get(`/rooms/${room.id}`).set(auth())).status).toBe(200);
    });

    it.each(['PENDING', 'CONFIRMED'])('quarto com reserva %s (futura) → 409', async (status) => {
        const room = (await newRoom()).body;
        const reservation = await createReservation(app, jwt, guestId, room.id, { check_in_date: '2028-02-01', check_out_date: '2028-02-03' });
        await ReservationModel.update({ status }, { where: { id: reservation.id } });

        expectError(await request(app).delete(`/rooms/${room.id}`).set(auth()), 409, 'ROOM_IN_USE');
    });

    it('quarto extra de uma reserva ativa → 409', async () => {
        const main = (await newRoom()).body;
        const extra = (await newRoom()).body;
        const res = await request(app).post('/reservations').set(auth()).send({
            guest_id: guestId, room_id: main.id, extra_room_ids: [extra.id],
            check_in_date: '2028-03-01', check_out_date: '2028-03-03'
        });
        expect(res.status).toBe(201);

        expectError(await request(app).delete(`/rooms/${extra.id}`).set(auth()), 409, 'ROOM_IN_USE');
    });

    it('quarto só com reserva cancelada → 204', async () => {
        const room = (await newRoom()).body;
        const reservation = await createReservation(app, jwt, guestId, room.id, { check_in_date: '2028-04-01', check_out_date: '2028-04-03' });
        await request(app).put(`/reservations/${reservation.id}/cancel`).set(auth());

        expect((await request(app).delete(`/rooms/${room.id}`).set(auth())).status).toBe(204);
    });
});
