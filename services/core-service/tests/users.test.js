import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from './helpers/createApp.js';
import { truncateAll } from './helpers/db.js';
import { registerAndLogin } from './helpers/auth.js';

// CRUD de usuários (UserApi) — todas as rotas exigem role ADMIN.

const app = createApp();
let adminJwt;

beforeAll(async () => {
    await truncateAll();
    ({ jwt: adminJwt } = await registerAndLogin(app, { tenantName: 'Hotel Usuarios' }));
});

describe('POST /users', () => {
    it('cria usuário RECEPTIONIST e retorna 201 sem expor o hash', async () => {
        const res = await request(app)
            .post('/users')
            .set('Authorization', `Bearer ${adminJwt}`)
            .send({ name: 'Recep 1', email: 'recep1@test.com', password: 'senha123' });

        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({ name: 'Recep 1', email: 'recep1@test.com', role: 'RECEPTIONIST' });
        expect(res.body.password_hash).toBeUndefined();
    });

    it('retorna 400 sem campos obrigatórios', async () => {
        const res = await request(app)
            .post('/users')
            .set('Authorization', `Bearer ${adminJwt}`)
            .send({ name: 'Incompleto' });
        expect(res.status).toBe(400);
    });

    it('retorna 409 com e-mail duplicado no mesmo tenant', async () => {
        await request(app).post('/users').set('Authorization', `Bearer ${adminJwt}`)
            .send({ name: 'Dup', email: 'dup@test.com', password: 'senha123' });
        const res = await request(app).post('/users').set('Authorization', `Bearer ${adminJwt}`)
            .send({ name: 'Dup 2', email: 'dup@test.com', password: 'senha123' });
        expect(res.status).toBe(409);
    });
});

describe('GET /users', () => {
    it('lista usuários do tenant', async () => {
        const res = await request(app).get('/users').set('Authorization', `Bearer ${adminJwt}`);
        expect(res.status).toBe(200);
        const list = res.body.data ?? res.body;
        expect(Array.isArray(list)).toBe(true);
        expect(list.length).toBeGreaterThanOrEqual(1);
    });

    it('retorna 404 para ID inexistente', async () => {
        const res = await request(app)
            .get('/users/00000000-0000-0000-0000-000000000000')
            .set('Authorization', `Bearer ${adminJwt}`);
        expect(res.status).toBe(404);
    });
});

describe('PUT e DELETE /users/:id', () => {
    it('atualiza e remove (soft delete) um usuário', async () => {
        const created = await request(app).post('/users').set('Authorization', `Bearer ${adminJwt}`)
            .send({ name: 'Temp', email: 'temp@test.com', password: 'senha123' });
        const id = created.body.id;

        const upd = await request(app).put(`/users/${id}`).set('Authorization', `Bearer ${adminJwt}`)
            .send({ name: 'Temp Atualizado' });
        expect(upd.status).toBe(200);
        expect(upd.body.name).toBe('Temp Atualizado');

        const del = await request(app).delete(`/users/${id}`).set('Authorization', `Bearer ${adminJwt}`);
        expect(del.status).toBe(204);
    });
});

describe('Controle de acesso (requireRole ADMIN)', () => {
    it('RECEPTIONIST recebe 403 ao listar usuários', async () => {
        await request(app).post('/users').set('Authorization', `Bearer ${adminJwt}`)
            .send({ name: 'Recep Role', email: 'receprole@test.com', password: 'senha123' });
        const login = await request(app).post('/auth/login')
            .send({ email: 'receprole@test.com', password: 'senha123' });
        const recepJwt = login.body.token;

        const res = await request(app).get('/users').set('Authorization', `Bearer ${recepJwt}`);
        expect(res.status).toBe(403);
    });

    it('sem token retorna 401', async () => {
        const res = await request(app).get('/users');
        expect(res.status).toBe(401);
    });
});
