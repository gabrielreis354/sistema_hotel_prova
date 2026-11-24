import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from './helpers/createApp.js';
import { truncateAll } from './helpers/db.js';
import { registerAndLogin } from './helpers/auth.js';

const app = createApp();
let jwt;
let categoryId;

beforeAll(async () => {
    await truncateAll();
    ({ jwt } = await registerAndLogin(app, { tenantName: 'Hotel Categoria' }));

    // Categoria principal criada no beforeAll — categoryId disponível para todos os testes
    const res = await request(app)
        .post('/room-categories')
        .set('Authorization', `Bearer ${jwt}`)
        .send({ name: 'Luxo', description: 'Suite de luxo', capacity: 2, price_per_night: 500 });
    categoryId = res.body.id;
});

describe('POST /room-categories', () => {
    it('cria categoria e retorna 201', async () => {
        const res = await request(app)
            .post('/room-categories')
            .set('Authorization', `Bearer ${jwt}`)
            .send({ name: 'Standard', description: 'Quarto padrão', capacity: 2, price_per_night: 200 });

        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({ name: 'Standard', price_per_night: '200.00' });
    });

    it('retorna 400 sem campos obrigatórios', async () => {
        const res = await request(app)
            .post('/room-categories')
            .set('Authorization', `Bearer ${jwt}`)
            .send({});

        expect(res.status).toBe(400);
    });
});

describe('GET /room-categories', () => {
    it('lista categorias do tenant', async () => {
        const res = await request(app)
            .get('/room-categories')
            .set('Authorization', `Bearer ${jwt}`);

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.data ?? res.body)).toBe(true);
    });

    it('retorna categoria por ID', async () => {
        const res = await request(app)
            .get(`/room-categories/${categoryId}`)
            .set('Authorization', `Bearer ${jwt}`);

        expect(res.status).toBe(200);
        expect(res.body.id).toBe(categoryId);
    });

    it('retorna 404 para ID inexistente', async () => {
        const res = await request(app)
            .get('/room-categories/00000000-0000-0000-0000-000000000000')
            .set('Authorization', `Bearer ${jwt}`);

        expect(res.status).toBe(404);
    });
});

describe('PUT /room-categories/:id', () => {
    it('atualiza categoria e retorna 200', async () => {
        const res = await request(app)
            .put(`/room-categories/${categoryId}`)
            .set('Authorization', `Bearer ${jwt}`)
            .send({ name: 'Luxo Premium', price_per_night: 600 });

        expect(res.status).toBe(200);
    });
});

describe('DELETE /room-categories/:id', () => {
    it('remove categoria (soft delete) e retorna 204', async () => {
        const createRes = await request(app)
            .post('/room-categories')
            .set('Authorization', `Bearer ${jwt}`)
            .send({ name: 'Para Deletar', capacity: 1, price_per_night: 100 });

        const res = await request(app)
            .delete(`/room-categories/${createRes.body.id}`)
            .set('Authorization', `Bearer ${jwt}`);

        expect(res.status).toBe(204);
    });
});

describe('Nome da categoria sem diferença de caixa (QA 24/11, 🟢-1)', () => {
    // "QA Suíte Teste" e "qa suíte teste" conviviam, e o seletor do quarto mostrava duas opções
    // quase iguais com diárias diferentes.
    const post = (name) => request(app).post('/room-categories').set('Authorization', `Bearer ${jwt}`)
        .send({ name, capacity: 2, price_per_night: 300 });

    it('criar com o mesmo nome em outra caixa → 409 com o code de nome em uso', async () => {
        expect((await post('Suíte Família')).status).toBe(201);
        const res = await post('suíte FAMÍLIA');
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('CATEGORY_NAME_TAKEN');
    });

    it('renomear para o nome de outra em outra caixa → 409; manter o próprio nome mudando a caixa vale', async () => {
        const other = (await post('Chalé Casal')).body;
        const res = await request(app).put(`/room-categories/${other.id}`).set('Authorization', `Bearer ${jwt}`)
            .send({ name: 'SUÍTE FAMÍLIA' }); // a do teste anterior
        expect(res.status).toBe(409);
        const own = await request(app).put(`/room-categories/${other.id}`).set('Authorization', `Bearer ${jwt}`)
            .send({ name: 'chalé casal' });
        expect(own.status).toBe(200);
    });

    it('o mesmo nome em outro hotel continua valendo', async () => {
        const { jwt: otherJwt } = await registerAndLogin(app, { tenantName: 'Hotel Categoria Vizinho' });
        const res = await request(app).post('/room-categories').set('Authorization', `Bearer ${otherJwt}`)
            .send({ name: 'luxo', capacity: 2, price_per_night: 100 });
        expect(res.status).toBe(201);
    });
});
