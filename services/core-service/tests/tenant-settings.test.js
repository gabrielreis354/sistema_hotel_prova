import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from './helpers/createApp.js';
import { truncateAll } from './helpers/db.js';
import { registerAndLogin } from './helpers/auth.js';

// Config do hotel: GET/PUT /tenants/me — auto-gestão do próprio tenant (do JWT).

const app = createApp();
let adminJwt;
let subdomain;

beforeAll(async () => {
    await truncateAll();
    ({ jwt: adminJwt, subdomain } = await registerAndLogin(app, { tenantName: 'Hotel Config' }));
});

describe('GET /tenants/me', () => {
    it('retorna a config do próprio hotel (defaults do motor de reserva)', async () => {
        const res = await request(app).get('/tenants/me').set('Authorization', `Bearer ${adminJwt}`);
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ subdomain, status: 'ACTIVE' });
        expect(res.body.booking_enabled).toBe(true);
        expect(res.body.deposit_percent).toBe(30);
    });

    it('sem token retorna 401', async () => {
        const res = await request(app).get('/tenants/me');
        expect(res.status).toBe(401);
    });
});

describe('PUT /tenants/me', () => {
    it('ADMIN atualiza nome, booking_enabled e deposit_percent', async () => {
        const res = await request(app)
            .put('/tenants/me')
            .set('Authorization', `Bearer ${adminJwt}`)
            .send({ name: 'Hotel Config Renomeado', booking_enabled: false, deposit_percent: 50 });

        expect(res.status).toBe(200);
        expect(res.body.name).toBe('Hotel Config Renomeado');
        expect(res.body.booking_enabled).toBe(false);
        expect(res.body.deposit_percent).toBe(50);
        // subdomain NÃO muda (identidade)
        expect(res.body.subdomain).toBe(subdomain);
    });

    it('desligar booking_enabled bloqueia a página pública de reservas (403)', async () => {
        // já foi desligado no teste anterior
        const res = await request(app).get(`/public/${subdomain}/hotel`);
        expect(res.status).toBe(403);
    });

    it('rejeita deposit_percent fora de 0–100 (400)', async () => {
        const res = await request(app)
            .put('/tenants/me')
            .set('Authorization', `Bearer ${adminJwt}`)
            .send({ deposit_percent: 150 });
        expect(res.status).toBe(400);
    });

    it('rejeita name vazio (400)', async () => {
        const res = await request(app)
            .put('/tenants/me')
            .set('Authorization', `Bearer ${adminJwt}`)
            .send({ name: '   ' });
        expect(res.status).toBe(400);
    });

    it('RECEPTIONIST recebe 403 ao tentar editar config', async () => {
        await request(app).post('/users').set('Authorization', `Bearer ${adminJwt}`)
            .send({ name: 'Recep', email: 'recep_cfg@test.com', password: 'senha123' });
        const login = await request(app).post('/auth/login')
            .send({ email: 'recep_cfg@test.com', password: 'senha123' });

        const res = await request(app)
            .put('/tenants/me')
            .set('Authorization', `Bearer ${login.body.token}`)
            .send({ deposit_percent: 10 });
        expect(res.status).toBe(403);
    });
});
