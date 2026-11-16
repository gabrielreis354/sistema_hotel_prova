// :id que não é UUID responde 404, não 500, em todos os routers com :id (repasse do red team de 15/11,
// docs/qa/repasses/para_dono-indefinido_15112026.md). O de reservas já tinha a guarda
// (reservation-invalid-id.test.js); aqui vão os outros oito. O 500 vinha do cast inválido no
// Postgres (22P02) e registrava no log o SQL com o tenant_id.
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from './helpers/createApp.js';
import { truncateAll } from './helpers/db.js';
import { registerAndLogin } from './helpers/auth.js';

const app = createApp();
let jwt;

beforeAll(async () => {
    await truncateAll();
    ({ jwt } = await registerAndLogin(app, { tenantName: 'Hotel Ids Invalidos' }));
});

const X = 'nao-e-uuid';
const MISSING = '00000000-0000-4000-8000-000000000000';

// [método, caminho, corpo de erro esperado] — a mensagem é a mesma que o controller já devolve
// para um UUID que não existe.
const ROUTES = [
    ['get', `/guests/${X}`, 'Hóspede não encontrado'],
    ['put', `/guests/${X}`, 'Hóspede não encontrado'],
    ['delete', `/guests/${X}`, 'Hóspede não encontrado'],
    ['get', `/rooms/${X}`, 'Quarto não encontrado'],
    ['put', `/rooms/${X}`, 'Quarto não encontrado'],
    ['put', `/rooms/${X}/release`, 'Quarto não encontrado'],
    ['delete', `/rooms/${X}`, 'Quarto não encontrado'],
    ['get', `/room-categories/${X}`, 'Categoria não encontrada'],
    ['put', `/room-categories/${X}`, 'Categoria não encontrada'],
    ['delete', `/room-categories/${X}`, 'Categoria não encontrada'],
    ['get', `/payments/${X}`, 'Pagamento não encontrado.'],
    ['put', `/payments/${X}`, 'Pagamento não encontrado.'],
    ['post', `/payments/${X}/void`, 'Pagamento não encontrado.'],
    ['get', `/users/${X}`, 'Usuário não encontrado'],
    ['put', `/users/${X}`, 'Usuário não encontrado'],
    ['delete', `/users/${X}`, 'Usuário não encontrado'],
    ['get', `/contracts/${X}`, 'Contrato não encontrado'],
    ['get', `/contracts/${X}/pdf`, 'Contrato não encontrado'],
    ['put', `/contracts/${X}`, 'Contrato não encontrado'],
    ['put', `/contracts/${X}/sign`, 'Contrato não encontrado'],
    ['put', `/contracts/${X}/cancel`, 'Contrato não encontrado'],
    ['delete', `/contracts/${X}`, 'Contrato não encontrado'],
    ['put', `/contracts/${X}/installments/${MISSING}/pay`, 'Contrato não encontrado'],
    ['put', `/contracts/${MISSING}/installments/${X}/pay`, 'Parcela não encontrada'],
    ['get', `/corporate-clients/${X}`, 'Cliente não encontrado'],
    ['put', `/corporate-clients/${X}`, 'Cliente não encontrado'],
    ['delete', `/corporate-clients/${X}`, 'Cliente não encontrado'],
    ['get', `/event-quotes/${X}`, 'Orçamento não encontrado'],
    ['get', `/event-quotes/${X}/pdf`, 'Orçamento não encontrado'],
    ['put', `/event-quotes/${X}`, 'Orçamento não encontrado'],
    ['put', `/event-quotes/${X}/confirm`, 'Orçamento não encontrado'],
    ['put', `/event-quotes/${X}/cancel`, 'Orçamento não encontrado'],
    ['delete', `/event-quotes/${X}`, 'Orçamento não encontrado'],
];

describe(':id que não é UUID nos routers do core', () => {
    it.each(ROUTES)('%s %s → 404 "%s"', async (method, path, error) => {
        const res = await request(app)[method](path).set('Authorization', `Bearer ${jwt}`).send({});
        expect(res.status).toBe(404);
        expect(res.body).toEqual({ error });
    });

    it('sem token continua 401 antes de olhar o id', async () => {
        const res = await request(app).get(`/guests/${X}`);
        expect(res.status).toBe(401);
    });

    it('UUID válido que não existe continua 404 pelo controller', async () => {
        const res = await request(app).get(`/guests/${MISSING}`).set('Authorization', `Bearer ${jwt}`);
        expect(res.status).toBe(404);
        expect(res.body).toEqual({ error: 'Hóspede não encontrado' });
    });
});
