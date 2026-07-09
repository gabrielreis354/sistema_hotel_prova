import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from './helpers/createApp.js';
import { truncateAll } from './helpers/db.js';
import { registerAndLogin } from './helpers/auth.js';

// Smoke tests do módulo B2B (clientes corporativos, orçamentos de evento, contratos).
// Cobre o CRUD — endpoints /pdf são omitidos (dependem de MinIO, indisponível em teste/CI).

const app = createApp();
let jwt;
let clientId;
let quoteId;

const auth = () => ({ Authorization: `Bearer ${jwt}` });

beforeAll(async () => {
    await truncateAll();
    ({ jwt } = await registerAndLogin(app, { tenantName: 'Hotel B2B' }));
});

describe('Corporate Clients — CRUD', () => {
    it('POST cria cliente corporativo (201)', async () => {
        const res = await request(app).post('/corporate-clients').set(auth()).send({
            razao_social: 'Empresa Eventos LTDA',
            cnpj: '12.345.678/0001-90',
            email: 'contato@empresa.com',
            telefone: '(11) 3000-0000',
            representante_nome: 'Fulano de Tal',
            representante_cpf: '123.456.789-00',
            representante_rg: '12.345.678-9',
        });
        expect(res.status).toBe(201);
        expect(res.body.id).toBeTruthy();
        clientId = res.body.id;
    });

    it('POST sem razao_social retorna 400', async () => {
        const res = await request(app).post('/corporate-clients').set(auth()).send({ email: 'x@x.com' });
        expect(res.status).toBe(400);
    });

    it('GET lista e GET por id (200)', async () => {
        const list = await request(app).get('/corporate-clients').set(auth());
        expect(list.status).toBe(200);
        const one = await request(app).get(`/corporate-clients/${clientId}`).set(auth());
        expect(one.status).toBe(200);
        expect(one.body.id).toBe(clientId);
    });

    it('PUT atualiza cliente (200)', async () => {
        const res = await request(app).put(`/corporate-clients/${clientId}`).set(auth())
            .send({ telefone: '(11) 4000-0000' });
        expect(res.status).toBe(200);
    });

    it('GET id inexistente retorna 404', async () => {
        const res = await request(app).get('/corporate-clients/00000000-0000-0000-0000-000000000000').set(auth());
        expect(res.status).toBe(404);
    });
});

describe('Event Quotes — CRUD', () => {
    it('POST cria orçamento vinculado ao cliente (201)', async () => {
        const res = await request(app).post('/event-quotes').set(auth()).send({
            corporate_client_id: clientId,
            check_in: '2027-09-01',
            check_out: '2027-09-03',
            pessoas: 20,
            valor_diaria_com_refeicao: 250,
            inclui_refeicao: true,
        });
        expect(res.status).toBe(201);
        expect(res.body.id).toBeTruthy();
        quoteId = res.body.id;
    });

    it('POST sem campos obrigatórios retorna 400', async () => {
        const res = await request(app).post('/event-quotes').set(auth()).send({ corporate_client_id: clientId });
        expect(res.status).toBe(400);
    });

    it('POST com cliente inexistente retorna 404', async () => {
        const res = await request(app).post('/event-quotes').set(auth()).send({
            corporate_client_id: '00000000-0000-0000-0000-000000000000',
            check_in: '2027-09-01', check_out: '2027-09-03', pessoas: 10,
        });
        expect(res.status).toBe(404);
    });

    it('GET lista e por id (200)', async () => {
        expect((await request(app).get('/event-quotes').set(auth())).status).toBe(200);
        expect((await request(app).get(`/event-quotes/${quoteId}`).set(auth())).status).toBe(200);
    });
});

describe('Contracts — CRUD', () => {
    let contractId;

    it('POST cria contrato a partir do cliente/orçamento (201)', async () => {
        const res = await request(app).post('/contracts').set(auth()).send({
            corporate_client_id: clientId,
            quote_id: quoteId,
            objeto: 'Hospedagem de evento corporativo',
            check_in: '2027-09-01',
            check_out: '2027-09-03',
            pessoas: 20,
            total: 5000,
            testemunha_1: 'Testemunha Um',
            testemunha_2: 'Testemunha Dois',
        });
        expect(res.status).toBe(201);
        expect(res.body.id).toBeTruthy();
        contractId = res.body.id;
    });

    it('POST sem campos obrigatórios retorna 400', async () => {
        const res = await request(app).post('/contracts').set(auth()).send({ corporate_client_id: clientId });
        expect(res.status).toBe(400);
    });

    it('GET lista e por id (200)', async () => {
        expect((await request(app).get('/contracts').set(auth())).status).toBe(200);
        expect((await request(app).get(`/contracts/${contractId}`).set(auth())).status).toBe(200);
    });
});

describe('B2B — segurança', () => {
    it('sem token retorna 401 nos 3 recursos', async () => {
        expect((await request(app).get('/corporate-clients')).status).toBe(401);
        expect((await request(app).get('/event-quotes')).status).toBe(401);
        expect((await request(app).get('/contracts')).status).toBe(401);
    });
});
