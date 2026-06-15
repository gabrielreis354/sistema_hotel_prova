import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from './helpers/createApp.js';
import { truncateAll } from './helpers/db.js';
import { registerAndLogin } from './helpers/auth.js';

const app = createApp();
let jwt;
let guestId;

beforeAll(async () => {
    await truncateAll();
    ({ jwt } = await registerAndLogin(app, { tenantName: 'Hotel Hóspedes' }));

    // Hóspede principal criado no beforeAll — guestId disponível para todos os testes
    const res = await request(app)
        .post('/guests')
        .set('Authorization', `Bearer ${jwt}`)
        .send({ full_name: 'João da Silva', cpf: '12345678901', email: 'joao@test.com', phone: '11999990000' });
    guestId = res.body.id;
});

describe('POST /guests', () => {
    it('cria hóspede e retorna 201', async () => {
        const res = await request(app)
            .post('/guests')
            .set('Authorization', `Bearer ${jwt}`)
            .send({ full_name: 'Carlos Secundário', cpf: '55544433322', email: 'carlos@test.com' });

        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({ full_name: 'Carlos Secundário' });
    });

    it('cria hóspede sem CPF (opcional)', async () => {
        const res = await request(app)
            .post('/guests')
            .set('Authorization', `Bearer ${jwt}`)
            .send({ full_name: 'Maria Sem CPF', email: 'maria@test.com' });

        expect(res.status).toBe(201);
        expect(res.body.cpf).toBeNull();
    });

    it('retorna 409 ao cadastrar CPF duplicado no mesmo tenant', async () => {
        const res = await request(app)
            .post('/guests')
            .set('Authorization', `Bearer ${jwt}`)
            .send({ full_name: 'João Duplicado', cpf: '12345678901' });

        expect(res.status).toBe(409);
    });

    it('retorna 400 sem full_name', async () => {
        const res = await request(app)
            .post('/guests')
            .set('Authorization', `Bearer ${jwt}`)
            .send({ cpf: '99999999999' });

        expect(res.status).toBe(400);
    });
});

describe('GET /guests', () => {
    it('lista hóspedes do tenant', async () => {
        const res = await request(app)
            .get('/guests')
            .set('Authorization', `Bearer ${jwt}`);

        expect(res.status).toBe(200);
        const list = res.body.data ?? res.body;
        expect(Array.isArray(list)).toBe(true);
        expect(list.length).toBeGreaterThanOrEqual(1);
    });

    it('retorna hóspede por ID', async () => {
        const res = await request(app)
            .get(`/guests/${guestId}`)
            .set('Authorization', `Bearer ${jwt}`);

        expect(res.status).toBe(200);
        expect(res.body.id).toBe(guestId);
    });

    it('retorna 404 para ID inexistente', async () => {
        const res = await request(app)
            .get('/guests/00000000-0000-0000-0000-000000000000')
            .set('Authorization', `Bearer ${jwt}`);

        expect(res.status).toBe(404);
    });
});

describe('PUT /guests/:id', () => {
    it('atualiza hóspede e retorna 200', async () => {
        const res = await request(app)
            .put(`/guests/${guestId}`)
            .set('Authorization', `Bearer ${jwt}`)
            .send({ phone: '11988887777' });

        expect(res.status).toBe(200);
    });
});

describe('DELETE /guests/:id', () => {
    it('remove hóspede (soft delete) e retorna 204', async () => {
        const createRes = await request(app)
            .post('/guests')
            .set('Authorization', `Bearer ${jwt}`)
            .send({ full_name: 'Para Deletar' });

        const res = await request(app)
            .delete(`/guests/${createRes.body.id}`)
            .set('Authorization', `Bearer ${jwt}`);

        expect(res.status).toBe(204);
    });
});
