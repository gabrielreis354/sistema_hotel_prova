import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from './helpers/createApp.js';
import { truncateAll } from './helpers/db.js';
import { registerAndLogin } from './helpers/auth.js';
import { createCategory, createRoom } from './helpers/factories.js';

// Smoke tests do módulo B2B (clientes corporativos, orçamentos de evento, contratos).
// Cobre o CRUD — endpoints /pdf são omitidos (dependem de MinIO, indisponível em teste/CI).

const app = createApp();
let jwt;
let clientId;
let quoteId;
let roomA, roomB;

const auth = () => ({ Authorization: `Bearer ${jwt}` });

beforeAll(async () => {
    await truncateAll();
    ({ jwt } = await registerAndLogin(app, { tenantName: 'Hotel B2B' }));
    const cat = await createCategory(app, jwt, { name: 'Evento', price_per_night: 300 });
    roomA = await createRoom(app, jwt, cat.id, { number: '901' });
    roomB = await createRoom(app, jwt, cat.id, { number: '902' });
});

async function createSignableContract(overrides = {}) {
    const res = await request(app).post('/contracts').set(auth()).send({
        corporate_client_id: clientId,
        objeto: 'Hospedagem de evento corporativo',
        check_in: '2027-10-01',
        check_out: '2027-10-03',
        pessoas: 10,
        total: 3000,
        testemunha_1: 'Testemunha Um',
        testemunha_2: 'Testemunha Dois',
        ...overrides,
    });
    return res.body;
}

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

    it('PUT genérico ignora status no body (issue #71)', async () => {
        const res = await request(app).put(`/event-quotes/${quoteId}`).set(auth()).send({ status: 'CONFIRMED', observacoes: 'nota' });
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('SENT');
    });
});

describe('Event Quotes — transição de status (issue #71)', () => {
    let quoteId;

    async function createQuote() {
        const res = await request(app).post('/event-quotes').set(auth()).send({
            corporate_client_id: clientId,
            check_in: '2027-08-01', check_out: '2027-08-03', pessoas: 5,
            valor_diaria_sem_refeicao: 100,
        });
        return res.body.id;
    }

    beforeAll(async () => { quoteId = await createQuote(); });

    it('confirma orçamento SENT -> CONFIRMED', async () => {
        const res = await request(app).put(`/event-quotes/${quoteId}/confirm`).set(auth());
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('CONFIRMED');
    });

    it('retorna 409 ao confirmar orçamento que já está confirmado', async () => {
        const res = await request(app).put(`/event-quotes/${quoteId}/confirm`).set(auth());
        expect(res.status).toBe(409);
    });

    it('cancela orçamento CONFIRMED -> CANCELLED', async () => {
        const res = await request(app).put(`/event-quotes/${quoteId}/cancel`).set(auth());
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('CANCELLED');
    });

    it('retorna 409 ao confirmar orçamento cancelado (bloqueia CANCELLED -> CONFIRMED)', async () => {
        const res = await request(app).put(`/event-quotes/${quoteId}/confirm`).set(auth());
        expect(res.status).toBe(409);
    });

    it('retorna 409 ao cancelar orçamento já cancelado', async () => {
        const res = await request(app).put(`/event-quotes/${quoteId}/cancel`).set(auth());
        expect(res.status).toBe(409);
    });

    it('retorna 404 ao confirmar orçamento inexistente', async () => {
        const res = await request(app).put('/event-quotes/00000000-0000-0000-0000-000000000000/confirm').set(auth());
        expect(res.status).toBe(404);
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
            total: 10000, // precisa bater com o total do orçamento vinculado (quoteId)
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

    it('POST com quote_id e total divergente do orçamento retorna 409 (issue #71)', async () => {
        const res = await request(app).post('/contracts').set(auth()).send({
            corporate_client_id: clientId,
            quote_id: quoteId,
            objeto: 'Hospedagem de evento corporativo',
            check_in: '2027-09-01',
            check_out: '2027-09-03',
            pessoas: 20,
            total: 1,
            testemunha_1: 'Testemunha Um',
            testemunha_2: 'Testemunha Dois',
        });
        expect(res.status).toBe(409);
    });

    it('PUT altera total de contrato vinculado a orçamento pra valor divergente retorna 409 (issue #71)', async () => {
        const res = await request(app).put(`/contracts/${contractId}`).set(auth()).send({ total: 1 });
        expect(res.status).toBe(409);
    });

    it('GET lista e por id (200)', async () => {
        expect((await request(app).get('/contracts').set(auth())).status).toBe(200);
        expect((await request(app).get(`/contracts/${contractId}`).set(auth())).status).toBe(200);
    });
});

describe('Contracts — sign/cancel bloqueiam e liberam quartos (issue #67)', () => {
    it('assina o contrato e bloqueia os quartos escolhidos', async () => {
        const contract = await createSignableContract();
        const res = await request(app).put(`/contracts/${contract.id}/sign`).set(auth())
            .send({ room_ids: [roomA.id, roomB.id] });

        expect(res.status).toBe(200);
        expect(res.body.status).toBe('SIGNED');
        expect(res.body.reservation_id).toBeTruthy();
    });

    it('retorna 409 ao tentar assinar contrato já assinado', async () => {
        const contract = await createSignableContract();
        await request(app).put(`/contracts/${contract.id}/sign`).set(auth()).send({ room_ids: [roomA.id] });
        const res = await request(app).put(`/contracts/${contract.id}/sign`).set(auth()).send({ room_ids: [roomA.id] });
        expect(res.status).toBe(409);
    });

    it('retorna 409 ao assinar contrato usando quarto já bloqueado no mesmo período', async () => {
        const first = await createSignableContract({ check_in: '2027-11-01', check_out: '2027-11-03' });
        await request(app).put(`/contracts/${first.id}/sign`).set(auth()).send({ room_ids: [roomA.id] });

        const second = await createSignableContract({ check_in: '2027-11-02', check_out: '2027-11-04' });
        const res = await request(app).put(`/contracts/${second.id}/sign`).set(auth()).send({ room_ids: [roomA.id] });
        expect(res.status).toBe(409);
        expect(res.body.room_ids).toContain(roomA.id);
    });

    it('cancelar o contrato libera o quarto para um novo contrato no mesmo período', async () => {
        const first = await createSignableContract({ check_in: '2027-12-01', check_out: '2027-12-03' });
        await request(app).put(`/contracts/${first.id}/sign`).set(auth()).send({ room_ids: [roomB.id] });

        const cancel = await request(app).put(`/contracts/${first.id}/cancel`).set(auth());
        expect(cancel.status).toBe(200);
        expect(cancel.body.status).toBe('CANCELLED');

        const second = await createSignableContract({ check_in: '2027-12-01', check_out: '2027-12-03' });
        const res = await request(app).put(`/contracts/${second.id}/sign`).set(auth()).send({ room_ids: [roomB.id] });
        expect(res.status).toBe(200);
    });
});

describe('Contracts — parcelas com status de pagamento (issue #68)', () => {
    let contractId, installmentId;

    it('cria contrato com parcelas (PENDING por padrão)', async () => {
        const res = await request(app).post('/contracts').set(auth()).send({
            corporate_client_id: clientId,
            objeto: 'Evento com parcelamento',
            check_in: '2028-01-01', check_out: '2028-01-03', pessoas: 5, total: 1000,
            testemunha_1: 'T1', testemunha_2: 'T2',
            installments: [{ descricao: '1/2', data_vencimento: '2028-01-01', valor: 500 }],
        });
        expect(res.status).toBe(201);
        contractId = res.body.id;
        installmentId = res.body.installments?.[0]?.id;

        const get = await request(app).get(`/contracts/${contractId}`).set(auth());
        expect(get.body.installments[0].status).toBe('PENDING');
        expect(get.body.installments_paid_total).toBe(0);
        expect(get.body.installments_balance).toBe(500);
    });

    it('PUT .../installments/:id/pay marca como paga', async () => {
        const res = await request(app).put(`/contracts/${contractId}/installments/${installmentId}/pay`).set(auth());
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('PAID');
        expect(res.body.paid_at).toBeTruthy();

        const get = await request(app).get(`/contracts/${contractId}`).set(auth());
        expect(get.body.installments_paid_total).toBe(500);
        expect(get.body.installments_balance).toBe(0);
    });

    it('retorna 409 ao tentar pagar parcela já paga', async () => {
        const res = await request(app).put(`/contracts/${contractId}/installments/${installmentId}/pay`).set(auth());
        expect(res.status).toBe(409);
    });

    it('editar installments via PUT genérico não derruba parcela já paga, e bloqueia removê-la', async () => {
        const get = await request(app).get(`/contracts/${contractId}`).set(auth());
        const paid = get.body.installments[0];

        // Tentar remover a parcela paga (não reenviá-la no array) deve falhar
        const removeAttempt = await request(app).put(`/contracts/${contractId}`).set(auth())
            .send({ installments: [{ descricao: 'Nova parcela', data_vencimento: '2028-02-01', valor: 200 }] });
        expect(removeAttempt.status).toBe(409);

        // Reenviando a parcela paga (com o mesmo id) + uma nova é aceito e preserva o status
        const update = await request(app).put(`/contracts/${contractId}`).set(auth()).send({
            installments: [
                { id: paid.id, descricao: paid.descricao, data_vencimento: paid.data_vencimento, valor: paid.valor },
                { descricao: '2/2', data_vencimento: '2028-02-01', valor: 500 },
            ],
        });
        expect(update.status).toBe(200);
        const stillPaid = update.body.installments.find(i => i.id === paid.id);
        expect(stillPaid.status).toBe('PAID');
        expect(update.body.installments_paid_total).toBe(500);
    });
});

describe('B2B — segurança', () => {
    it('sem token retorna 401 nos 3 recursos', async () => {
        expect((await request(app).get('/corporate-clients')).status).toBe(401);
        expect((await request(app).get('/event-quotes')).status).toBe(401);
        expect((await request(app).get('/contracts')).status).toBe(401);
    });
});
