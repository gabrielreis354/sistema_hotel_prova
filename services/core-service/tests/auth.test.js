import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from './helpers/createApp.js';
import { truncateAll } from './helpers/db.js';

const app = createApp();

beforeAll(async () => {
    await truncateAll();
});

describe('POST /auth/register', () => {
    it('cria tenant e usuário admin, retornando 201 sem expor senha', async () => {
        const res = await request(app).post('/auth/register').send({
            tenantName: 'Hotel Aurora',
            name: 'Admin Aurora',
            email: 'admin@aurora.com',
            password: 'senha123',
        });

        expect(res.status).toBe(201);
        expect(res.body.tenant).toMatchObject({ name: 'Hotel Aurora', subdomain: 'hotel-aurora' });
        expect(res.body.user).toMatchObject({ email: 'admin@aurora.com', role: 'ADMIN' });
        expect(res.body.user.password).toBeUndefined();
        expect(res.body.user.password_hash).toBeUndefined();
    });

    it('gera subdomain automaticamente a partir do nome do hotel', async () => {
        const res = await request(app).post('/auth/register').send({
            tenantName: 'Pousada São João',
            name: 'Admin',
            email: 'admin@pousada.com',
            password: 'senha123',
        });

        expect(res.status).toBe(201);
        expect(res.body.tenant.subdomain).toBe('pousada-sao-joao');
    });

    it('retorna 409 quando subdomain já está em uso', async () => {
        const res = await request(app).post('/auth/register').send({
            tenantName: 'Hotel Aurora',
            name: 'Outro Admin',
            email: 'outro@aurora.com',
            password: 'senha123',
        });

        expect(res.status).toBe(409);
    });

    it('retorna 400 quando campos obrigatórios estão ausentes', async () => {
        const res = await request(app).post('/auth/register').send({
            tenantName: 'Hotel X',
        });

        expect(res.status).toBe(400);
        expect(res.body.errors).toBeDefined();
    });
});

describe('POST /auth/login', () => {
    it('retorna JWT válido com credenciais corretas (sem subdomain)', async () => {
        const res = await request(app).post('/auth/login').send({
            email: 'admin@aurora.com',
            password: 'senha123',
        });

        expect(res.status).toBe(200);
        expect(res.body.token).toBeDefined();
        expect(res.body.token.split('.')).toHaveLength(3);
        expect(res.body.user).toMatchObject({ email: 'admin@aurora.com', role: 'ADMIN' });
    });

    it('retorna JWT válido com credenciais corretas e subdomain explícito', async () => {
        const res = await request(app).post('/auth/login').send({
            email: 'admin@aurora.com',
            password: 'senha123',
            subdomain: 'hotel-aurora',
        });

        expect(res.status).toBe(200);
        expect(res.body.token).toBeDefined();
        expect(res.body.token.split('.')).toHaveLength(3);
    });

    it('retorna 401 com senha incorreta', async () => {
        const res = await request(app).post('/auth/login').send({
            email: 'admin@aurora.com',
            password: 'senhaerrada',
        });

        expect(res.status).toBe(401);
    });

    it('retorna 401 com subdomain inexistente', async () => {
        const res = await request(app).post('/auth/login').send({
            email: 'admin@aurora.com',
            password: 'senha123',
            subdomain: 'hotel-fantasma',
        });

        expect(res.status).toBe(401);
    });

    it('retorna 401 com email inexistente', async () => {
        const res = await request(app).post('/auth/login').send({
            email: 'naoexiste@test.com',
            password: 'senha123',
        });

        expect(res.status).toBe(401);
    });

    it('retorna 400 sem campos obrigatórios', async () => {
        const res = await request(app).post('/auth/login').send({});
        expect(res.status).toBe(400);
    });
});

describe('POST /auth/login — colisão de e-mail multi-tenant', () => {
    // Cria dois tenants com o mesmo e-mail para validar o comportamento
    // de desambiguação via subdomain introduzido no fix de segurança.
    beforeAll(async () => {
        await request(app).post('/auth/register').send({
            tenantName: 'Hotel Alpha',
            name: 'Admin Alpha',
            email: 'shared@multihotel.com',
            password: 'senha123',
        });
        await request(app).post('/auth/register').send({
            tenantName: 'Hotel Beta',
            name: 'Admin Beta',
            email: 'shared@multihotel.com',
            password: 'senha123',
        });
    });

    it('retorna 409 quando e-mail existe em múltiplos tenants e subdomain não é informado', async () => {
        const res = await request(app).post('/auth/login').send({
            email: 'shared@multihotel.com',
            password: 'senha123',
        });

        expect(res.status).toBe(409);
        expect(res.body.requires).toBe('subdomain');
    });

    it('retorna 200 com subdomain correto desambiguando o tenant', async () => {
        const res = await request(app).post('/auth/login').send({
            email: 'shared@multihotel.com',
            password: 'senha123',
            subdomain: 'hotel-alpha',
        });

        expect(res.status).toBe(200);
        expect(res.body.token).toBeDefined();
        expect(res.body.token.split('.')).toHaveLength(3);
    });

    it('retorna JWT com tenantId do hotel correto ao usar subdomain', async () => {
        const resAlpha = await request(app).post('/auth/login').send({
            email: 'shared@multihotel.com',
            password: 'senha123',
            subdomain: 'hotel-alpha',
        });
        const resBeta = await request(app).post('/auth/login').send({
            email: 'shared@multihotel.com',
            password: 'senha123',
            subdomain: 'hotel-beta',
        });

        expect(resAlpha.status).toBe(200);
        expect(resBeta.status).toBe(200);

        // Os dois tokens devem ter tenantIds diferentes
        const payloadAlpha = JSON.parse(Buffer.from(resAlpha.body.token.split('.')[1], 'base64').toString());
        const payloadBeta  = JSON.parse(Buffer.from(resBeta.body.token.split('.')[1],  'base64').toString());
        expect(payloadAlpha.tenantId).not.toBe(payloadBeta.tenantId);
    });

    it('retorna 401 com subdomain inexistente mesmo com e-mail e senha corretos', async () => {
        const res = await request(app).post('/auth/login').send({
            email: 'shared@multihotel.com',
            password: 'senha123',
            subdomain: 'hotel-fantasma',
        });

        expect(res.status).toBe(401);
    });
});

describe('Proteção por authMiddleware', () => {
    it('retorna 401 ao acessar rota protegida sem token', async () => {
        const res = await request(app).get('/rooms');
        expect(res.status).toBe(401);
    });

    it('retorna 401 com token inválido', async () => {
        const res = await request(app)
            .get('/rooms')
            .set('Authorization', 'Bearer token.invalido.aqui');
        expect(res.status).toBe(401);
    });
});
