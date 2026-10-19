import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from './helpers/createApp.js';
import { truncateAll } from './helpers/db.js';
import { registerAndLogin } from './helpers/auth.js';
import { createCategory, createRoom, createGuest, createReservation } from './helpers/factories.js';
import PaymentModel from '../app/Models/PaymentModel.js';

const app = createApp();
let jwt;
let reservationId;
let paymentId;

beforeAll(async () => {
    await truncateAll();
    ({ jwt } = await registerAndLogin(app, { tenantName: 'Hotel Pagamentos' }));

    const cat    = await createCategory(app, jwt);
    const room   = await createRoom(app, jwt, cat.id, { number: '301' });
    const guest  = await createGuest(app, jwt);
    const reservation = await createReservation(app, jwt, guest.id, room.id);
    reservationId = reservation.id;

    // Pagamento principal criado no beforeAll — paymentId disponível para todos os testes
    const payRes = await request(app)
        .post('/payments')
        .set('Authorization', `Bearer ${jwt}`)
        .send({ reservation_id: reservationId, amount: 800, method: 'PIX' });
    paymentId = payRes.body.id;
});

describe('POST /payments', () => {
    it('registra pagamento e retorna 201', async () => {
        const res = await request(app)
            .post('/payments')
            .set('Authorization', `Bearer ${jwt}`)
            .send({ reservation_id: reservationId, amount: 200, method: 'DINHEIRO' });

        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({ method: 'DINHEIRO' });
        expect(parseFloat(res.body.amount)).toBe(200);
    });

    it('retorna 400 sem campos obrigatórios', async () => {
        const res = await request(app)
            .post('/payments')
            .set('Authorization', `Bearer ${jwt}`)
            .send({ reservation_id: reservationId });

        expect(res.status).toBe(400);
    });

    it('retorna 404 com reservation_id inexistente', async () => {
        const res = await request(app)
            .post('/payments')
            .set('Authorization', `Bearer ${jwt}`)
            .send({
                reservation_id: '00000000-0000-0000-0000-000000000000',
                amount: 100,
                method: 'CARTAO',
            });

        expect(res.status).toBe(404);
    });
});

describe('GET /payments', () => {
    it('lista pagamentos do tenant', async () => {
        const res = await request(app)
            .get('/payments')
            .set('Authorization', `Bearer ${jwt}`);

        expect(res.status).toBe(200);
        const list = res.body.data ?? res.body;
        expect(Array.isArray(list)).toBe(true);
        expect(list.length).toBeGreaterThanOrEqual(1);
    });

    it('retorna pagamento por ID', async () => {
        const res = await request(app)
            .get(`/payments/${paymentId}`)
            .set('Authorization', `Bearer ${jwt}`);

        expect(res.status).toBe(200);
        expect(res.body.id).toBe(paymentId);
    });

    it('retorna 404 para ID inexistente', async () => {
        const res = await request(app)
            .get('/payments/00000000-0000-0000-0000-000000000000')
            .set('Authorization', `Bearer ${jwt}`);

        expect(res.status).toBe(404);
    });
});

describe('GET /payments e GET /payments/:id não vazam dados do provedor PIX', () => {
    // Achado 🔴 reconfirmado pelas auditorias qa-redteam de 16/09, 21/09 (webhook) e
    // 21/09 (paranoid-unique): estes dois endpoints faziam PaymentModel.findAll/findOne
    // sem `attributes`, devolvendo pix_qr_code, provider e provider_charge_id — o
    // provider_charge_id é a ÚNICA credencial que POST /webhooks/pix exige (T-06.9).
    // Qualquer usuário autenticado do tenant, mesmo sem papel ADMIN, conseguia ler o
    // valor e usá-lo para forjar a confirmação de um pagamento alheio.
    //
    // O defaultScope de PaymentModel (não a allowlist de cada controller) é quem
    // garante isto: um terceiro consumidor futuro que esquecer o `attributes` continua
    // protegido — é o padrão fail-safe recomendado pelas auditorias.
    let jwtPix;
    let paymentIdPix;

    beforeAll(async () => {
        // Só o fluxo de reserva pública gera provider_charge_id/pix_qr_code de verdade
        // (o POST /payments manual da recepção não passa pelo provider PIX).
        ({ jwt: jwtPix } = await registerAndLogin(app, { tenantName: 'Hotel Pix Leak Check' }));
        const cat = await createCategory(app, jwtPix, { name: 'Standard', capacity: 2, price_per_night: 100 });
        await createRoom(app, jwtPix, cat.id, { number: '501' });

        // registerAndLogin não devolve subdomain daqui — pega da config do próprio tenant.
        const tenantRes = await request(app).get('/tenants/me').set('Authorization', `Bearer ${jwtPix}`);
        const subdomain = tenantRes.body.subdomain;

        const booking = await request(app)
            .post(`/public/${subdomain}/bookings`)
            .send({
                category_id: cat.id, check_in: '2027-09-01', check_out: '2027-09-03',
                guest: { full_name: 'Hóspede Pix', email: 'pix@example.com' },
            });

        paymentIdPix = booking.body.payment.id;
    });

    it('confirma que o pagamento tem os 3 campos sensíveis gravados no banco (controle positivo)', async () => {
        // Sem isto, "não aparece na resposta" poderia ser porque o valor nunca existiu,
        // não porque o defaultScope escondeu. unscoped() prova que os dados estão lá.
        const bruto = await PaymentModel.unscoped().findByPk(paymentIdPix);
        expect(bruto.provider_charge_id).toBeTruthy();
        expect(bruto.pix_qr_code).toBeTruthy();
        expect(bruto.provider).toBeTruthy();
    });

    it('GET /payments não devolve pix_qr_code, provider nem provider_charge_id', async () => {
        const res = await request(app).get('/payments').set('Authorization', `Bearer ${jwtPix}`);
        const payment = res.body.find((p) => p.id === paymentIdPix);

        expect(payment).toBeTruthy();
        expect(payment.pix_qr_code).toBeUndefined();
        expect(payment.provider).toBeUndefined();
        expect(payment.provider_charge_id).toBeUndefined();
    });

    it('GET /payments/:id não devolve pix_qr_code, provider nem provider_charge_id', async () => {
        const res = await request(app).get(`/payments/${paymentIdPix}`).set('Authorization', `Bearer ${jwtPix}`);

        expect(res.status).toBe(200);
        expect(res.body.pix_qr_code).toBeUndefined();
        expect(res.body.provider).toBeUndefined();
        expect(res.body.provider_charge_id).toBeUndefined();
    });
});

describe('DELETE /payments/:id', () => {
    it('remove pagamento (soft delete) e retorna 204', async () => {
        const createRes = await request(app)
            .post('/payments')
            .set('Authorization', `Bearer ${jwt}`)
            .send({ reservation_id: reservationId, amount: 50, method: 'DINHEIRO' });

        const res = await request(app)
            .delete(`/payments/${createRes.body.id}`)
            .set('Authorization', `Bearer ${jwt}`);

        expect(res.status).toBe(204);
    });
});
