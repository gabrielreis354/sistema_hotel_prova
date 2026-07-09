import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from './helpers/createApp.js';
import { truncateAll } from './helpers/db.js';
import { registerAndLogin } from './helpers/auth.js';
import { createCategory, createRoom } from './helpers/factories.js';

// Testes do MOTOR DE RESERVA DIRETA + PIX (diferencial nº1).
// Rotas públicas (sem auth) resolvidas por subdomínio + webhook de confirmação PIX.

const app = createApp();
let subdomain;
let jwt;
let categoryId;

beforeAll(async () => {
    await truncateAll();
    ({ jwt, subdomain } = await registerAndLogin(app, { tenantName: 'Hotel Reserva Direta' }));

    const cat = await createCategory(app, jwt, { name: 'Standard', capacity: 2, price_per_night: 150 });
    categoryId = cat.id;
    // 2 quartos na categoria para haver disponibilidade
    await createRoom(app, jwt, categoryId, { number: '101' });
    await createRoom(app, jwt, categoryId, { number: '102' });
});

describe('GET /public/:subdomain/hotel', () => {
    it('retorna dados públicos do hotel (nome + deposit_percent)', async () => {
        const res = await request(app).get(`/public/${subdomain}/hotel`);
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ subdomain });
        expect(res.body.name).toBeTruthy();
        expect(typeof res.body.deposit_percent).toBe('number');
    });

    it('retorna 404 para subdomínio inexistente', async () => {
        const res = await request(app).get('/public/hotel-que-nao-existe/hotel');
        expect(res.status).toBe(404);
    });
});

describe('GET /public/:subdomain/availability', () => {
    it('lista categorias disponíveis no período com preço', async () => {
        const res = await request(app)
            .get(`/public/${subdomain}/availability`)
            .query({ check_in: '2027-05-01', check_out: '2027-05-04', guests: 2 });

        expect(res.status).toBe(200);
        expect(res.body.nights).toBe(3);
        expect(Array.isArray(res.body.categories)).toBe(true);
        const standard = res.body.categories.find((c) => c.category_id === categoryId);
        expect(standard).toBeTruthy();
        expect(standard.available_rooms).toBe(2);
        expect(standard.total_price).toBe(450); // 3 noites × 150
    });

    it('retorna 400 sem check_in/check_out', async () => {
        const res = await request(app).get(`/public/${subdomain}/availability`);
        expect(res.status).toBe(400);
    });

    it('retorna 400 quando check_out <= check_in', async () => {
        const res = await request(app)
            .get(`/public/${subdomain}/availability`)
            .query({ check_in: '2027-05-04', check_out: '2027-05-01' });
        expect(res.status).toBe(400);
    });
});

describe('POST /public/:subdomain/bookings — fluxo completo com PIX', () => {
    let bookingId;
    let providerChargeId;

    it('cria reserva PENDING + cobrança PIX do sinal e retorna 201', async () => {
        const res = await request(app)
            .post(`/public/${subdomain}/bookings`)
            .send({
                category_id: categoryId,
                check_in: '2027-06-10',
                check_out: '2027-06-13',
                guests: 2,
                guest: { full_name: 'Maria Hóspede', email: 'maria@example.com' },
            });

        expect(res.status).toBe(201);
        expect(res.body.reservation.status).toBe('PENDING');
        expect(res.body.reservation.nights).toBe(3);
        expect(res.body.reservation.total_amount).toBe(450);
        // sinal padrão de 30% sobre 450 = 135
        expect(res.body.payment.kind).toBe('DEPOSIT');
        expect(res.body.payment.status).toBe('PENDING');
        expect(res.body.payment.amount).toBe(135);
        expect(res.body.payment.balance_due_on_checkin).toBe(315);
        expect(res.body.pix.qr_code).toBeTruthy();
        expect(res.body.pix.provider_charge_id).toBeTruthy();

        bookingId = res.body.reservation.id;
        providerChargeId = res.body.pix.provider_charge_id;
    });

    it('status inicial da reserva é não-confirmado (aguardando PIX)', async () => {
        const res = await request(app).get(`/public/${subdomain}/bookings/${bookingId}/status`);
        expect(res.status).toBe(200);
        expect(res.body.confirmed).toBe(false);
        expect(res.body.deposit.status).toBe('PENDING');
    });

    it('webhook PIX confirma o pagamento e promove a reserva para CONFIRMED', async () => {
        const res = await request(app)
            .post('/webhooks/pix')
            .send({ provider_charge_id: providerChargeId });

        expect(res.status).toBe(200);
        expect(res.body.status).toBe('confirmed');
        expect(res.body.reservation_status).toBe('CONFIRMED');
    });

    it('status após pagamento reflete CONFIRMED + depósito PAID', async () => {
        const res = await request(app).get(`/public/${subdomain}/bookings/${bookingId}/status`);
        expect(res.status).toBe(200);
        expect(res.body.confirmed).toBe(true);
        expect(res.body.deposit.status).toBe('PAID');
        expect(res.body.deposit.paid_at).toBeTruthy();
    });

    it('webhook é idempotente (reenvio não reprocessa)', async () => {
        const res = await request(app)
            .post('/webhooks/pix')
            .send({ provider_charge_id: providerChargeId });

        expect(res.status).toBe(200);
        expect(res.body.status).toBe('already_processed');
    });
});

describe('POST /public/:subdomain/bookings — validações', () => {
    it('retorna 400 sem dados do hóspede', async () => {
        const res = await request(app)
            .post(`/public/${subdomain}/bookings`)
            .send({ category_id: categoryId, check_in: '2027-07-01', check_out: '2027-07-03' });
        expect(res.status).toBe(400);
    });

    it('retorna 404 com categoria inexistente', async () => {
        const res = await request(app)
            .post(`/public/${subdomain}/bookings`)
            .send({
                category_id: '00000000-0000-0000-0000-000000000000',
                check_in: '2027-07-01',
                check_out: '2027-07-03',
                guest: { full_name: 'João', email: 'joao@example.com' },
            });
        expect(res.status).toBe(404);
    });
});

describe('POST /webhooks/pix — validações', () => {
    it('retorna 400 sem provider_charge_id', async () => {
        const res = await request(app).post('/webhooks/pix').send({});
        expect(res.status).toBe(400);
    });

    it('retorna 404 para cobrança inexistente', async () => {
        const res = await request(app)
            .post('/webhooks/pix')
            .send({ provider_charge_id: 'fake_inexistente_000' });
        expect(res.status).toBe(404);
    });
});
