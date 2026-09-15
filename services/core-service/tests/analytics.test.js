import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from './helpers/createApp.js';
import { truncateAll } from './helpers/db.js';
import { registerAndLogin } from './helpers/auth.js';
import { createCategory, createRoom, createGuest, createReservation } from './helpers/factories.js';

// Smoke tests dos 7 endpoints de Analytics (BI hoteleiro) — todos read-only,
// exigem auth. Semeamos uma reserva + pagamento para os KPIs terem dados.

const app = createApp();
let jwt;

const ENDPOINTS = [
    '/analytics/revenue',
    '/analytics/occupancy',
    '/analytics/alerts',
    '/analytics/seasonality',
    '/analytics/revenue-by-category',
    '/analytics/payment-mix',
    '/analytics/top-guests',
];

beforeAll(async () => {
    await truncateAll();
    ({ jwt } = await registerAndLogin(app, { tenantName: 'Hotel Analytics' }));

    const cat   = await createCategory(app, jwt, { price_per_night: 250 });
    const room  = await createRoom(app, jwt, cat.id, { number: '401' });
    const guest = await createGuest(app, jwt);
    const reservation = await createReservation(app, jwt, guest.id, room.id, {
        check_in_date: '2027-04-01', check_out_date: '2027-04-04',
    });
    await request(app).post('/payments').set('Authorization', `Bearer ${jwt}`)
        .send({ reservation_id: reservation.id, amount: 750, method: 'PIX' });
});

describe('Analytics — os 7 endpoints respondem 200 com dados', () => {
    for (const ep of ENDPOINTS) {
        it(`GET ${ep} → 200 (JSON)`, async () => {
            const res = await request(app).get(ep).set('Authorization', `Bearer ${jwt}`);
            expect(res.status).toBe(200);
            expect(res.body).toBeTruthy();
        });
    }
});

describe('Analytics — KPIs específicos', () => {
    it('occupancy retorna ADR, RevPAR e taxa de ocupação', async () => {
        const res = await request(app).get('/analytics/occupancy').set('Authorization', `Bearer ${jwt}`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('occupancy_rate');
        expect(res.body).toHaveProperty('adr');
        expect(res.body).toHaveProperty('revpar');
        expect(res.body.total_rooms).toBeGreaterThanOrEqual(1);
    });

    it('payment-mix reflete o pagamento PIX registrado', async () => {
        const res = await request(app).get('/analytics/payment-mix').set('Authorization', `Bearer ${jwt}`);
        expect(res.status).toBe(200);
        const body = JSON.stringify(res.body);
        expect(body).toContain('PIX');
    });
});

describe('Analytics — segurança', () => {
    it('sem token retorna 401', async () => {
        const res = await request(app).get('/analytics/revenue');
        expect(res.status).toBe(401);
    });
});
