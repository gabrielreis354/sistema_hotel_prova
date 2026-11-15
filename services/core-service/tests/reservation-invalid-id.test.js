// :id que não é UUID nas rotas de reserva responde 404, não 500 (pendência do red team de 15/11).
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from './helpers/createApp.js';
import { truncateAll } from './helpers/db.js';
import { registerAndLogin } from './helpers/auth.js';

const app = createApp();
let jwt;

beforeAll(async () => {
    await truncateAll();
    ({ jwt } = await registerAndLogin(app, { tenantName: 'Hotel Id Invalido' }));
});

const ROUTES = [
    ['get', '/reservations/nao-e-uuid'],
    ['put', '/reservations/nao-e-uuid'],
    ['delete', '/reservations/nao-e-uuid'],
    ['put', '/reservations/nao-e-uuid/check-in'],
    ['put', '/reservations/nao-e-uuid/check-out'],
    ['put', '/reservations/nao-e-uuid/cancel'],
    ['post', '/reservations/nao-e-uuid/rooms'],
    ['get', '/reservations/nao-e-uuid/bill'],
    ['get', '/reservations/nao-e-uuid/accounts'],
    ['get', '/reservations/nao-e-uuid/consumptions'],
    ['post', '/reservations/nao-e-uuid/consumptions'],
    ['delete', '/reservations/nao-e-uuid/rooms/00000000-0000-4000-8000-000000000000'],
    ['delete', '/reservations/nao-e-uuid/consumptions/00000000-0000-4000-8000-000000000000'],
];

const MISSING = '00000000-0000-4000-8000-000000000000';

describe('rotas de reserva com :id inválido', () => {
    it.each(ROUTES)('%s %s → 404 "Reserva não encontrada"', async (method, path) => {
        const res = await request(app)[method](path).set('Authorization', `Bearer ${jwt}`).send({});
        expect(res.status).toBe(404);
        expect(res.body).toEqual({ error: 'Reserva não encontrada' });
    });

    it('sem token continua 401 antes de olhar o id', async () => {
        const res = await request(app).put('/reservations/nao-e-uuid/check-in');
        expect(res.status).toBe(401);
    });

    it('UUID válido que não existe continua 404 pelo controller', async () => {
        const res = await request(app)
            .put(`/reservations/${MISSING}/check-in`)
            .set('Authorization', `Bearer ${jwt}`);
        expect(res.status).toBe(404);
        expect(res.body).toEqual({ error: 'Reserva não encontrada' });
    });

    it(':roomId que não é UUID responde 404, não 500 (🟡-1 do red team)', async () => {
        const res = await request(app)
            .delete(`/reservations/${MISSING}/rooms/nao-e-uuid`)
            .set('Authorization', `Bearer ${jwt}`);
        expect(res.status).toBe(404);
        expect(res.body).toEqual({ error: 'Quarto não vinculado a esta reserva' });
    });

    it(':consumptionId que não é UUID continua 404 pelo controller', async () => {
        const res = await request(app)
            .delete(`/reservations/${MISSING}/consumptions/nao-e-uuid`)
            .set('Authorization', `Bearer ${jwt}`);
        expect(res.status).toBe(404);
    });
});
