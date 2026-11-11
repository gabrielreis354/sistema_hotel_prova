import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { QueryTypes } from 'sequelize';
import sequelize from '../database/connections/sequelize.js';
import { createApp } from './helpers/createApp.js';
import { truncateAll } from './helpers/db.js';
import { registerAndLogin } from './helpers/auth.js';
import { createCategory, createRoom, createGuest, createReservation } from './helpers/factories.js';

// Integração da H.2 com a develop de 28/10 (T-04.6 conta da suíte no check-in, comanda T-05.5,
// pagamento de conta T-04.4/T-06.13): os triggers do outbox continuam emitindo exatamente o catálogo
// v1.1 — nada de evento de `accounts`/`account_items` (fora do catálogo, §4.7) e o pagamento de conta
// sem reserva sai com `reservation_id: null` (§4.6, v1.1).

const app = createApp();
let jwt;
const auth = () => ({ Authorization: `Bearer ${jwt}` });
const TIPOS_DO_CATALOGO = /^(tenant\.(created|updated)|room_category\.(created|updated|deleted)|room\.(created|updated|deleted)|guest\.(created|updated|deleted|erased)|reservation\.(created|updated|status_changed|deleted)|payment\.(created|updated|status_changed|deleted))$/;
const eventosDesde = (id) => sequelize.query('SELECT id, type, aggregate_id, payload FROM outbox WHERE id > :id ORDER BY id',
    { replacements: { id }, type: QueryTypes.SELECT });
const ultimoId = async () => Number((await sequelize.query('SELECT coalesce(max(id), 0) AS m FROM outbox', { type: QueryTypes.SELECT }))[0].m);

let guestId;
let roomId;
beforeAll(async () => {
    await truncateAll();
    ({ jwt } = await registerAndLogin(app, { tenantName: 'Hotel Outbox Develop' }));
    const categoria = await createCategory(app, jwt, { name: 'Suíte Outbox', price_per_night: 300 });
    roomId = (await createRoom(app, jwt, categoria.id, { number: '501' })).id;
    guestId = (await createGuest(app, jwt, { full_name: 'Clara Outbox' })).id;
});

describe('Outbox × fluxos novos da develop (catálogo v1.1)', () => {
    it('check-in que cria a conta da suíte (T-04.6): reservation.status_changed + room.updated, nenhum evento de conta', async () => {
        const hoje = new Date().toISOString().slice(0, 10);
        const amanha = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
        const reserva = await createReservation(app, jwt, guestId, roomId, { check_in_date: hoje, check_out_date: amanha });

        const antes = await ultimoId();
        const checkIn = await request(app).put(`/reservations/${reserva.id}/check-in`).set(auth());
        expect(checkIn.status).toBe(200);
        const contas = await request(app).get(`/reservations/${reserva.id}/accounts`).set(auth());
        expect(contas.status).toBe(200);   // a conta da suíte existe (T-04.6)

        const eventos = await eventosDesde(antes);
        for (const e of eventos) expect(e.type).toMatch(TIPOS_DO_CATALOGO);
        expect(eventos.map((e) => e.type)).toEqual(expect.arrayContaining(['reservation.status_changed', 'room.updated']));
        expect(eventos.find((e) => e.type === 'reservation.status_changed').payload).toMatchObject({ status: 'CHECKED_IN' });
        expect(eventos.find((e) => e.type === 'room.updated').payload).toMatchObject({ status: 'OCCUPIED' });
    });

    it('comanda (conta, itens, fechamento) não gera evento; o pagamento da conta sem reserva sai com reservation_id null', async () => {
        const antes = await ultimoId();
        const conta = await request(app).post('/accounts').set(auth()).send({ type: 'DAY_USE', guest_id: guestId, label: 'Piscina Outbox' });
        expect(conta.status).toBe(201);
        expect((await request(app).post(`/accounts/${conta.body.id}/items`).set(auth()).send({ description: 'Água', unit_price: '6.50' })).status).toBe(201);
        expect(await eventosDesde(antes)).toEqual([]);   // accounts/account_items: fora do catálogo (§4.7)

        const pagamento = await request(app).post('/payments').set(auth()).send({ account_id: conta.body.id, amount: '6.50', method: 'PIX' });
        expect(pagamento.status).toBe(201);
        const fechar = await request(app).put(`/accounts/${conta.body.id}/close`).set(auth());
        expect(fechar.status).toBe(200);

        const eventos = await eventosDesde(antes);
        expect(eventos.map((e) => e.type)).toEqual(['payment.created']);
        expect(eventos[0].payload).toMatchObject({ reservation_id: null, amount: '6.50', method: 'PIX', status: 'PAID' });
    });
});
