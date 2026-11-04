import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from './helpers/createApp.js';
import { truncateAll } from './helpers/db.js';
import { registerAndLogin } from './helpers/auth.js';
import { createCategory, createRoom, createGuest, createReservation } from './helpers/factories.js';

// T-05.3 / D-1 (decisão do Gabriel de 04/11/2026): a recepção conclui a limpeza pelo painel
// "Hoje". Endpoint dedicado, só CLEANING → AVAILABLE — o PUT /rooms/:id genérico continua só
// do ADMIN e não é aberto para a recepção.

const app = createApp();
let adminJwt;
let receptionistJwt;
let waiterJwt;
let otherJwt;
let categoryId;
let guestId;

async function createUserToken(role) {
    const email = `${role.toLowerCase()}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@test.com`;
    const created = await request(app).post('/users').set('Authorization', `Bearer ${adminJwt}`)
        .send({ name: role, email, password: 'senha123', role });
    expect(created.status).toBe(201);
    const login = await request(app).post('/auth/login').send({ email, password: 'senha123' });
    return login.body.token;
}

/** Quarto levado a CLEANING pelo caminho real: check-in e check-out. */
async function roomInCleaning(number) {
    const room = await createRoom(app, adminJwt, categoryId, { number });
    const reservation = await createReservation(app, adminJwt, guestId, room.id, { check_in_date: '2027-07-01', check_out_date: '2027-07-02' });
    for (const step of ['check-in', 'check-out']) {
        const res = await request(app).put(`/reservations/${reservation.id}/${step}`).set('Authorization', `Bearer ${adminJwt}`);
        expect(res.status).toBe(200);
    }
    return room.id;
}

function release(id, token) {
    return request(app).put(`/rooms/${id}/release`).set('Authorization', `Bearer ${token}`);
}

beforeAll(async () => {
    await truncateAll();
    ({ jwt: adminJwt } = await registerAndLogin(app, { tenantName: 'Hotel Liberação' }));
    ({ jwt: otherJwt } = await registerAndLogin(app, { tenantName: 'Outro Hotel Liberação' }));
    receptionistJwt = await createUserToken('RECEPTIONIST');
    waiterJwt = await createUserToken('WAITER');
    categoryId = (await createCategory(app, adminJwt, { price_per_night: 100 })).id;
    guestId = (await createGuest(app, adminJwt, { full_name: 'Hóspede Liberação' })).id;
});

describe('PUT /rooms/:id/release', () => {
    it('RECEPTIONIST libera quarto em CLEANING → AVAILABLE', async () => {
        const id = await roomInCleaning('401');
        const res = await release(id, receptionistJwt);
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('AVAILABLE');
        const get = await request(app).get(`/rooms/${id}`).set('Authorization', `Bearer ${adminJwt}`);
        expect(get.body.status).toBe('AVAILABLE');
    });

    it('ADMIN também libera', async () => {
        const id = await roomInCleaning('402');
        const res = await release(id, adminJwt);
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('AVAILABLE');
    });

    it.each([
        ['AVAILABLE', async () => (await createRoom(app, adminJwt, categoryId, { number: '403' })).id],
        ['MAINTENANCE', async () => (await createRoom(app, adminJwt, categoryId, { number: '404', status: 'MAINTENANCE' })).id],
    ])('quarto em %s → 409 com code, sem mudar o status', async (status, make) => {
        const id = await make();
        const res = await release(id, receptionistJwt);
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('ROOM_STATUS_TRANSITION_NOT_ALLOWED');
        const get = await request(app).get(`/rooms/${id}`).set('Authorization', `Bearer ${adminJwt}`);
        expect(get.body.status).toBe(status);
    });

    it('quarto OCCUPIED → 409 (hóspede dentro não volta para a venda)', async () => {
        const room = await createRoom(app, adminJwt, categoryId, { number: '405' });
        const r = await createReservation(app, adminJwt, guestId, room.id, { check_in_date: '2027-07-05', check_out_date: '2027-07-06' });
        await request(app).put(`/reservations/${r.id}/check-in`).set('Authorization', `Bearer ${adminJwt}`);
        const res = await release(room.id, receptionistJwt);
        expect(res.status).toBe(409);
    });

    it('quarto de outro hotel → 404, e o quarto continua em CLEANING', async () => {
        const id = await roomInCleaning('406');
        const res = await release(id, otherJwt);
        expect(res.status).toBe(404);
        const get = await request(app).get(`/rooms/${id}`).set('Authorization', `Bearer ${adminJwt}`);
        expect(get.body.status).toBe('CLEANING');
    });

    it('id que não é UUID → 404, não 500', async () => {
        const res = await release('abc', receptionistJwt);
        expect(res.status).toBe(404);
    });

    it('WAITER → 403', async () => {
        const id = await roomInCleaning('407');
        const res = await release(id, waiterJwt);
        expect(res.status).toBe(403);
    });

    it('sem token → 401', async () => {
        const res = await request(app).put('/rooms/00000000-0000-0000-0000-000000000000/release');
        expect(res.status).toBe(401);
    });

    it('a recepção continua sem o PUT genérico (D-1 não abre a edição)', async () => {
        const id = await roomInCleaning('408');
        const res = await request(app).put(`/rooms/${id}`).set('Authorization', `Bearer ${receptionistJwt}`).send({ status: 'AVAILABLE' });
        expect(res.status).toBe(403);
    });
});
