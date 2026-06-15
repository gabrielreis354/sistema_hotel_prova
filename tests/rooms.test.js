import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from './helpers/createApp.js';
import { truncateAll } from './helpers/db.js';
import { registerAndLogin } from './helpers/auth.js';
import { createCategory, createGuest, createReservation } from './helpers/factories.js';

const app = createApp();
let jwt;
let categoryId;
let roomId;
let roomId2;

beforeAll(async () => {
    await truncateAll();
    ({ jwt } = await registerAndLogin(app, { tenantName: 'Hotel Quartos' }));
    const cat = await createCategory(app, jwt, { price_per_night: 150 });
    categoryId = cat.id;

    // Quartos principais criados no beforeAll — IDs disponíveis para todos os testes
    const r1 = await request(app)
        .post('/rooms')
        .set('Authorization', `Bearer ${jwt}`)
        .send({ category_id: categoryId, number: '101', floor: 1, status: 'AVAILABLE' });
    roomId = r1.body.id;

    const r2 = await request(app)
        .post('/rooms')
        .set('Authorization', `Bearer ${jwt}`)
        .send({ category_id: categoryId, number: '102', floor: 1, status: 'AVAILABLE' });
    roomId2 = r2.body.id;
});

describe('POST /rooms', () => {
    it('cria quarto e retorna 201', async () => {
        const res = await request(app)
            .post('/rooms')
            .set('Authorization', `Bearer ${jwt}`)
            .send({ category_id: categoryId, number: '103', floor: 1, status: 'AVAILABLE' });

        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({ number: '103', status: 'AVAILABLE' });
    });

    it('cria segundo quarto', async () => {
        const res = await request(app)
            .post('/rooms')
            .set('Authorization', `Bearer ${jwt}`)
            .send({ category_id: categoryId, number: '104', floor: 1, status: 'AVAILABLE' });

        expect(res.status).toBe(201);
    });

    it('retorna 400 sem campos obrigatórios', async () => {
        const res = await request(app)
            .post('/rooms')
            .set('Authorization', `Bearer ${jwt}`)
            .send({});

        expect(res.status).toBe(400);
    });
});

describe('GET /rooms', () => {
    it('lista quartos do tenant com paginação', async () => {
        const res = await request(app)
            .get('/rooms')
            .set('Authorization', `Bearer ${jwt}`);

        expect(res.status).toBe(200);
        const list = res.body.data ?? res.body;
        expect(Array.isArray(list)).toBe(true);
        expect(list.length).toBeGreaterThanOrEqual(2);
    });

    it('retorna quarto por ID', async () => {
        const res = await request(app)
            .get(`/rooms/${roomId}`)
            .set('Authorization', `Bearer ${jwt}`);

        expect(res.status).toBe(200);
        expect(res.body.id).toBe(roomId);
    });

    it('retorna 404 para ID inexistente', async () => {
        const res = await request(app)
            .get('/rooms/00000000-0000-0000-0000-000000000000')
            .set('Authorization', `Bearer ${jwt}`);

        expect(res.status).toBe(404);
    });
});

describe('GET /rooms/available', () => {
    it('retorna 400 sem parâmetros de data', async () => {
        const res = await request(app)
            .get('/rooms/available')
            .set('Authorization', `Bearer ${jwt}`);

        expect(res.status).toBe(400);
    });

    it('retorna 400 quando check_in >= check_out', async () => {
        const res = await request(app)
            .get('/rooms/available?check_in=2027-05-10&check_out=2027-05-05')
            .set('Authorization', `Bearer ${jwt}`);

        expect(res.status).toBe(400);
    });

    it('lista ambos os quartos disponíveis sem reservas', async () => {
        const res = await request(app)
            .get('/rooms/available?check_in=2027-05-01&check_out=2027-05-05')
            .set('Authorization', `Bearer ${jwt}`);

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        const ids = res.body.map(r => r.id);
        expect(ids).toContain(roomId);
        expect(ids).toContain(roomId2);
        expect(res.body[0]).toHaveProperty('category');
    });

    it('exclui quarto reservado no período', async () => {
        const guest = await createGuest(app, jwt);
        await createReservation(app, jwt, guest.id, roomId, {
            check_in_date: '2027-06-10',
            check_out_date: '2027-06-15',
        });

        const res = await request(app)
            .get('/rooms/available?check_in=2027-06-10&check_out=2027-06-15')
            .set('Authorization', `Bearer ${jwt}`);

        expect(res.status).toBe(200);
        const ids = res.body.map(r => r.id);
        expect(ids).not.toContain(roomId);
        expect(ids).toContain(roomId2);
    });
});

describe('PUT /rooms/:id', () => {
    it('atualiza status do quarto e retorna 200', async () => {
        const res = await request(app)
            .put(`/rooms/${roomId}`)
            .set('Authorization', `Bearer ${jwt}`)
            .send({ status: 'MAINTENANCE' });

        expect(res.status).toBe(200);
    });
});

describe('DELETE /rooms/:id', () => {
    it('remove quarto (soft delete) e retorna 204', async () => {
        const createRes = await request(app)
            .post('/rooms')
            .set('Authorization', `Bearer ${jwt}`)
            .send({ category_id: categoryId, number: '199', floor: 1, status: 'AVAILABLE' });

        const res = await request(app)
            .delete(`/rooms/${createRes.body.id}`)
            .set('Authorization', `Bearer ${jwt}`);

        expect(res.status).toBe(204);
    });
});
