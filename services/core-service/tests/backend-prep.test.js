import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from './helpers/createApp.js';
import { truncateAll } from './helpers/db.js';
import { registerAndLogin } from './helpers/auth.js';
import { createCategory, createRoom, createGuest, createReservation } from './helpers/factories.js';

const app = createApp();

// Cria um usuário WAITER no tenant do admin e devolve o JWT dele.
async function createWaiterToken(adminJwt) {
    const email = `garcom_${Date.now()}@test.com`;
    const password = 'senha123';

    const createRes = await request(app)
        .post('/users')
        .set('Authorization', `Bearer ${adminJwt}`)
        .send({ name: 'Garçom', email, password, role: 'WAITER' });

    expect(createRes.status).toBe(201);
    expect(createRes.body.role).toBe('WAITER');

    const loginRes = await request(app).post('/auth/login').send({ email, password });
    expect(loginRes.status).toBe(200);
    return loginRes.body.token;
}

// ─── CORS ───────────────────────────────────────────────────────────────────

describe('CORS', () => {
    it('responde requisição cross-origin com Access-Control-Allow-Origin', async () => {
        const res = await request(app)
            .get('/health')
            .set('Origin', 'http://localhost:5173');

        expect(res.status).toBe(200);
        expect(res.headers['access-control-allow-origin']).toBeDefined();
    });

    it('responde preflight OPTIONS com 204 e cabeçalhos de método/headers', async () => {
        const res = await request(app)
            .options('/reservations')
            .set('Origin', 'http://localhost:5173')
            .set('Access-Control-Request-Method', 'GET');

        expect(res.status).toBe(204);
        expect(res.headers['access-control-allow-methods']).toContain('GET');
        expect(res.headers['access-control-allow-headers']).toContain('Authorization');
    });
});

// ─── GET /reservations — filtro de datas e paginação ─────────────────────────

describe('GET /reservations — filtro e paginação', () => {
    let jwt;

    beforeAll(async () => {
        await truncateAll();
        ({ jwt } = await registerAndLogin(app, { tenantName: 'Hotel Prep' }));
        const cat = await createCategory(app, jwt, { price_per_night: 100 });
        const room = await createRoom(app, jwt, cat.id, { number: 'P01' });
        const guest = await createGuest(app, jwt, { full_name: 'Hóspede Prep' });

        // Reserva em janeiro e outra em março, no mesmo quarto (períodos distintos).
        await createReservation(app, jwt, guest.id, room.id, {
            check_in_date: '2028-01-10', check_out_date: '2028-01-15',
        });
        await createReservation(app, jwt, guest.id, room.id, {
            check_in_date: '2028-03-10', check_out_date: '2028-03-15',
        });
    });

    it('sem query devolve array puro (contrato antigo preservado)', async () => {
        const res = await request(app)
            .get('/reservations')
            .set('Authorization', `Bearer ${jwt}`);

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBe(2);
    });

    it('?from=&to= devolve só as reservas que se sobrepõem ao período', async () => {
        const res = await request(app)
            .get('/reservations?from=2028-01-01&to=2028-01-31')
            .set('Authorization', `Bearer ${jwt}`);

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBe(1);
        expect(res.body[0].check_in_date).toBe('2028-01-10');
    });

    it('?page=&limit= devolve envelope { data, total, page, limit }', async () => {
        const res = await request(app)
            .get('/reservations?page=1&limit=1')
            .set('Authorization', `Bearer ${jwt}`);

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ page: 1, limit: 1, total: 2 });
        expect(Array.isArray(res.body.data)).toBe(true);
        expect(res.body.data.length).toBe(1);
    });

    it('?from= em formato inválido retorna 400 (não 500)', async () => {
        const res = await request(app)
            .get('/reservations?from=abc')
            .set('Authorization', `Bearer ${jwt}`);

        expect(res.status).toBe(400);
    });
});

// ─── Role WAITER ─────────────────────────────────────────────────────────────

describe('Role WAITER', () => {
    let adminJwt;
    let waiterJwt;

    beforeAll(async () => {
        await truncateAll();
        ({ jwt: adminJwt } = await registerAndLogin(app, { tenantName: 'Hotel Waiter' }));
        waiterJwt = await createWaiterToken(adminJwt);
    });

    it('POST /users rejeita role inválido com 400', async () => {
        const res = await request(app)
            .post('/users')
            .set('Authorization', `Bearer ${adminJwt}`)
            .send({ name: 'X', email: `x_${Date.now()}@test.com`, password: 'senha123', role: 'HACKER' });

        expect(res.status).toBe(400);
    });

    it('PUT /users rejeita role inválido com 400 (não 500)', async () => {
        const email = `u_${Date.now()}@test.com`;
        const created = await request(app)
            .post('/users')
            .set('Authorization', `Bearer ${adminJwt}`)
            .send({ name: 'U', email, password: 'senha123', role: 'RECEPTIONIST' });
        expect(created.status).toBe(201);

        const res = await request(app)
            .put(`/users/${created.body.id}`)
            .set('Authorization', `Bearer ${adminJwt}`)
            .send({ role: 'HACKER' });

        expect(res.status).toBe(400);
    });

    it('WAITER recebe 403 em GET /rooms', async () => {
        const res = await request(app).get('/rooms').set('Authorization', `Bearer ${waiterJwt}`);
        expect(res.status).toBe(403);
    });

    it('WAITER recebe 403 em GET /users', async () => {
        const res = await request(app).get('/users').set('Authorization', `Bearer ${waiterJwt}`);
        expect(res.status).toBe(403);
    });

    it('WAITER recebe 403 em GET /analytics/revenue', async () => {
        const res = await request(app).get('/analytics/revenue').set('Authorization', `Bearer ${waiterJwt}`);
        expect(res.status).toBe(403);
    });

    it('ADMIN continua acessando GET /rooms (não houve over-block)', async () => {
        const res = await request(app).get('/rooms').set('Authorization', `Bearer ${adminJwt}`);
        expect(res.status).toBe(200);
    });
});
