import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from './helpers/createApp.js';
import { truncateAll } from './helpers/db.js';
import { registerAndLogin } from './helpers/auth.js';
import { createCategory, createRoom, createGuest, createReservation } from './helpers/factories.js';

// Módulo Financeiro — consumos extras + fechamento de conta (bill).
// bill = (diária + consumos) − pagamentos confirmados.

const app = createApp();
let jwt;
let reservationId;

async function pay(amount, method = 'DINHEIRO') {
    return request(app).post('/payments').set('Authorization', `Bearer ${jwt}`)
        .send({ reservation_id: reservationId, amount, method });
}
async function addConsumption(description, amount) {
    return request(app).post(`/reservations/${reservationId}/consumptions`)
        .set('Authorization', `Bearer ${jwt}`).send({ description, amount });
}
async function getBill() {
    return request(app).get(`/reservations/${reservationId}/bill`).set('Authorization', `Bearer ${jwt}`);
}

beforeAll(async () => {
    await truncateAll();
    ({ jwt } = await registerAndLogin(app, { tenantName: 'Hotel Conta' }));
    const cat  = await createCategory(app, jwt, { price_per_night: 200 });
    const room = await createRoom(app, jwt, cat.id, { number: '501' });
    const guest = await createGuest(app, jwt);
    // 4 noites × 200 = 800 de diária
    const reservation = await createReservation(app, jwt, guest.id, room.id, {
        check_in_date: '2027-03-01', check_out_date: '2027-03-05',
    });
    reservationId = reservation.id;
});

describe('POST /reservations/:id/consumptions', () => {
    it('lança consumo extra e retorna 201', async () => {
        const res = await addConsumption('Frigobar', 50);
        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({ description: 'Frigobar' });
        expect(Number(res.body.amount)).toBe(50);
    });

    it('retorna 400 sem description ou amount inválido', async () => {
        expect((await addConsumption('', 50)).status).toBe(400);
        expect((await addConsumption('X', 0)).status).toBe(400);
    });

    it('retorna 404 para reserva de outro tenant', async () => {
        const { jwt: otherJwt } = await registerAndLogin(app, { tenantName: 'Outro Hotel Conta' });
        const res = await request(app).post(`/reservations/${reservationId}/consumptions`)
            .set('Authorization', `Bearer ${otherJwt}`).send({ description: 'Invasor', amount: 10 });
        expect(res.status).toBe(404);
    });
});

describe('GET /reservations/:id/bill', () => {
    it('soma diária + consumos e desconta pagamentos confirmados', async () => {
        await addConsumption('Restaurante', 120); // consumos: 50 + 120 = 170
        await pay(800);                            // paga a diária (800)

        const res = await getBill();
        expect(res.status).toBe(200);
        expect(res.body.room_total).toBe(800);
        expect(res.body.consumptions_total).toBe(170);
        expect(res.body.grand_total).toBe(970);
        expect(res.body.total_paid).toBe(800);
        expect(res.body.balance_due).toBe(170);   // 970 − 800
        expect(res.body.fully_paid).toBe(false);
    });

    it('sinal PIX PENDING não conta como pago (fica em total_pending)', async () => {
        // cria uma reserva online (PIX PENDING) e confere que o bill não a considera paga
        const { jwt: j2, subdomain } = await registerAndLogin(app, { tenantName: 'Hotel Pix Bill' });
        const cat = await createCategory(app, j2, { name: 'Std', price_per_night: 100 });
        await createRoom(app, j2, cat.id, { number: '601' });
        const booking = await request(app).post(`/public/${subdomain}/bookings`).send({
            category_id: cat.id, check_in: '2027-08-01', check_out: '2027-08-03',
            guest: { full_name: 'Pix Bill', email: 'pixbill@example.com' },
        });
        const rid = booking.body.reservation.id;

        const res = await request(app).get(`/reservations/${rid}/bill`).set('Authorization', `Bearer ${j2}`);
        expect(res.status).toBe(200);
        expect(res.body.room_total).toBe(200);      // 2 noites × 100
        expect(res.body.total_paid).toBe(0);        // sinal ainda PENDING
        expect(res.body.total_pending).toBe(60);    // 30% de 200
        expect(res.body.balance_due).toBe(200);
    });
});

describe('DELETE /reservations/:id/consumptions/:consumptionId', () => {
    it('remove consumo e o bill reflete a remoção', async () => {
        const created = await addConsumption('Lavanderia', 40);
        const before = await getBill();

        const del = await request(app)
            .delete(`/reservations/${reservationId}/consumptions/${created.body.id}`)
            .set('Authorization', `Bearer ${jwt}`);
        expect(del.status).toBe(204);

        const after = await getBill();
        expect(after.body.consumptions_total).toBe(before.body.consumptions_total - 40);
    });
});
