import crypto from 'crypto';
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import request from 'supertest';
import { createApp } from './helpers/createApp.js';
import { truncateAll } from './helpers/db.js';
import { registerAndLogin } from './helpers/auth.js';
import { createCategory, createRoom } from './helpers/factories.js';
import PaymentModel from '../app/Models/PaymentModel.js';
import ReservationModel from '../app/Models/ReservationModel.js';
import { resetPixProviderForTests } from '../app/services/pix/index.js';

// Regressão do achado 🔴 da auditoria qa-redteam (docs/qa/redteam_mercadopago-pix_21set2026.md):
// o webhook confirmava pagamento a partir de qualquer notificação ASSINADA, sem checar se o
// pagamento foi de fato aprovado. Estes testes rodam com PIX_PROVIDER=mercadopago de ponta a
// ponta (reserva pública → webhook), sem tocar rede — a API do Mercado Pago é mockada.

const ACCESS_TOKEN = 'TEST-mp-token';
const WEBHOOK_SECRET = 'segredo-webhook-teste';

function signWebhook({ dataId, requestId = 'req-1', ts = String(Math.floor(Date.now() / 1000)) }) {
    const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
    const v1 = crypto.createHmac('sha256', WEBHOOK_SECRET).update(manifest).digest('hex');
    return { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': requestId };
}

// Mocka a API do Mercado Pago: POST /v1/payments (criação da cobrança) e
// GET /v1/payments/:id (consulta de status, chamada pelo webhook). `statusRef` é mutável para
// cada teste ajustar o status "real" da cobrança antes de disparar o webhook.
function mockMercadoPago(chargeId, statusRef) {
    return vi.fn(async (url) => {
        if (url === 'https://api.mercadopago.com/v1/payments') {
            return {
                ok: true,
                status: 201,
                json: async () => ({
                    id: chargeId,
                    point_of_interaction: { transaction_data: { qr_code: 'qr-mp-sonda' } }
                })
            };
        }
        if (url === `https://api.mercadopago.com/v1/payments/${chargeId}`) {
            return { ok: true, status: 200, json: async () => ({ status: statusRef.status, transaction_amount: statusRef.amount }) };
        }
        throw new Error(`URL inesperada no mock do Mercado Pago: ${url}`);
    });
}

const app = createApp();
let subdomain;
let jwt;
let categoryId;
let chargeSeq = 900000;

beforeAll(async () => {
    await truncateAll();
    ({ jwt, subdomain } = await registerAndLogin(app, { tenantName: 'Hotel MP Webhook' }));
    const cat = await createCategory(app, jwt, { name: 'Standard', capacity: 2, price_per_night: 150 });
    categoryId = cat.id;
    await createRoom(app, jwt, categoryId, { number: '201' });
    await createRoom(app, jwt, categoryId, { number: '202' });
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});

// Devolve o provider ativo para 'fake' — a suíte roda em processo único (isolate:false),
// então sem isto os arquivos de teste seguintes herdariam o Mercado Pago desta suíte.
afterAll(() => {
    resetPixProviderForTests();
});

async function createMercadoPagoBooking(checkIn, checkOut) {
    const chargeId = String(chargeSeq++);
    const statusRef = { status: 'pending', amount: null };

    vi.stubEnv('PIX_PROVIDER', 'mercadopago');
    vi.stubEnv('MERCADOPAGO_ACCESS_TOKEN', ACCESS_TOKEN);
    vi.stubEnv('MERCADOPAGO_WEBHOOK_SECRET', WEBHOOK_SECRET);
    // O singleton do provider (app/services/pix/index.js) pode já estar em cache como
    // 'fake', criado por outro arquivo de teste antes deste — a suíte roda com isolate:false
    // (um processo só). Sem resetar, o PIX_PROVIDER acima seria ignorado.
    resetPixProviderForTests();
    vi.stubGlobal('fetch', mockMercadoPago(chargeId, statusRef));

    const booking = await request(app)
        .post(`/public/${subdomain}/bookings`)
        .send({
            category_id: categoryId,
            check_in: checkIn,
            check_out: checkOut,
            guests: 1,
            guest: { full_name: 'Hospede MP', email: `mp_${chargeId}@example.com` }
        });

    expect(booking.status).toBe(201);
    statusRef.amount = booking.body.payment.amount;

    return { chargeId, statusRef, booking };
}

describe('POST /webhooks/pix — provider Mercado Pago', () => {
    it('assinatura inválida é rejeitada com 401 e não altera pagamento nem reserva', async () => {
        const { chargeId, booking } = await createMercadoPagoBooking('2027-07-01', '2027-07-02');

        const res = await request(app)
            .post('/webhooks/pix')
            .set({ 'x-signature': 'ts=1,v1=' + '0'.repeat(64), 'x-request-id': 'req-adulterado' })
            .query({ 'data.id': chargeId })
            .send({});

        expect(res.status).toBe(401);

        const payment = await PaymentModel.findOne({ where: { reservation_id: booking.body.reservation.id } });
        expect(payment.status).toBe('PENDING');
        const reservation = await ReservationModel.findByPk(booking.body.reservation.id);
        expect(reservation.status).toBe('PENDING');
    });

    it('notificação autêntica com pagamento aprovado confirma o pagamento e a reserva', async () => {
        const { chargeId, statusRef, booking } = await createMercadoPagoBooking('2027-07-05', '2027-07-06');
        statusRef.status = 'approved';

        const res = await request(app)
            .post('/webhooks/pix')
            .set(signWebhook({ dataId: chargeId }))
            .query({ 'data.id': chargeId })
            .send({});

        expect(res.status).toBe(200);
        expect(res.body.status).toBe('confirmed');

        const payment = await PaymentModel.findOne({ where: { reservation_id: booking.body.reservation.id } });
        expect(payment.status).toBe('PAID');
        const reservation = await ReservationModel.findByPk(booking.body.reservation.id);
        expect(reservation.status).toBe('CONFIRMED');
    });

    it('notificação autêntica com pagamento ainda pendente não confirma nada (regressão do achado 🔴)', async () => {
        const { chargeId, booking } = await createMercadoPagoBooking('2027-07-10', '2027-07-11');
        // statusRef.status já é 'pending' por padrão — é exatamente a notificação que o
        // Mercado Pago envia na criação da cobrança (payment.created), antes de qualquer PIX pago.

        const res = await request(app)
            .post('/webhooks/pix')
            .set(signWebhook({ dataId: chargeId }))
            .query({ 'data.id': chargeId })
            .send({});

        expect(res.status).toBe(200);
        expect(res.body.status).toBe('pending');

        const payment = await PaymentModel.findOne({ where: { reservation_id: booking.body.reservation.id } });
        expect(payment.status).toBe('PENDING');
        const reservation = await ReservationModel.findByPk(booking.body.reservation.id);
        expect(reservation.status).toBe('PENDING');
    });

    it('notificação autêntica de pagamento rejeitado marca o Payment como FAILED, sem tocar a reserva', async () => {
        const { chargeId, statusRef, booking } = await createMercadoPagoBooking('2027-07-15', '2027-07-16');
        statusRef.status = 'rejected';

        const res = await request(app)
            .post('/webhooks/pix')
            .set(signWebhook({ dataId: chargeId }))
            .query({ 'data.id': chargeId })
            .send({});

        expect(res.status).toBe(200);
        expect(res.body.status).toBe('not_approved');

        const payment = await PaymentModel.findOne({ where: { reservation_id: booking.body.reservation.id } });
        expect(payment.status).toBe('FAILED');
        const reservation = await ReservationModel.findByPk(booking.body.reservation.id);
        expect(reservation.status).toBe('PENDING');
    });

    it('notificação aprovada com valor errado marca FAILED (sinal de fraude, não trava um status não-terminal)', async () => {
        const { chargeId, statusRef, booking } = await createMercadoPagoBooking('2027-07-20', '2027-07-21');
        statusRef.status = 'approved';
        statusRef.amount = Number(statusRef.amount) + 1000; // valor não bate com o payment.amount real

        const res = await request(app)
            .post('/webhooks/pix')
            .set(signWebhook({ dataId: chargeId }))
            .query({ 'data.id': chargeId })
            .send({});

        expect(res.status).toBe(200);
        expect(res.body.status).toBe('not_approved');

        const payment = await PaymentModel.findOne({ where: { reservation_id: booking.body.reservation.id } });
        expect(payment.status).toBe('FAILED');
    });

    it('regressão do achado 🟡 da reauditoria: status não-terminal com valor ainda desconhecido não trava em FAILED — uma notificação aprovada depois ainda confirma', async () => {
        const { chargeId, statusRef, booking } = await createMercadoPagoBooking('2027-07-25', '2027-07-26');

        // Primeira notificação: status ainda pending, com um valor divergente (ex.: o MP manda
        // a notificação antes de o valor da transação estar consolidado). Antes do fix, isto
        // marcava FAILED e travava o pagamento para sempre — mesmo o hóspede pagando certo depois.
        statusRef.status = 'pending';
        statusRef.amount = Number(statusRef.amount) + 1000;

        const first = await request(app)
            .post('/webhooks/pix')
            .set(signWebhook({ dataId: chargeId, requestId: 'req-1' }))
            .query({ 'data.id': chargeId })
            .send({});

        expect(first.status).toBe(200);
        expect(first.body.status).toBe('pending');

        let payment = await PaymentModel.findOne({ where: { reservation_id: booking.body.reservation.id } });
        expect(payment.status).toBe('PENDING');

        // Segunda notificação: agora aprovado, com o valor certo — precisa continuar
        // conseguindo confirmar, porque o pagamento ainda não chegou a um estado terminal.
        statusRef.status = 'approved';
        statusRef.amount = booking.body.payment.amount;

        const second = await request(app)
            .post('/webhooks/pix')
            .set(signWebhook({ dataId: chargeId, requestId: 'req-2' }))
            .query({ 'data.id': chargeId })
            .send({});

        expect(second.status).toBe(200);
        expect(second.body.status).toBe('confirmed');

        payment = await PaymentModel.findOne({ where: { reservation_id: booking.body.reservation.id } });
        expect(payment.status).toBe('PAID');
        const reservation = await ReservationModel.findByPk(booking.body.reservation.id);
        expect(reservation.status).toBe('CONFIRMED');
    });
});
