import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from './helpers/createApp.js';
import { truncateAll } from './helpers/db.js';
import { registerAndLogin } from './helpers/auth.js';
import { createCategory, createRoom, createGuest, createReservation } from './helpers/factories.js';

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
