import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import sequelize from '../database/connections/sequelize.js';
import { createApp } from './helpers/createApp.js';
import { truncateAll } from './helpers/db.js';
import { registerAndLogin } from './helpers/auth.js';
import { createCategory, createRoom, createGuest, createReservation } from './helpers/factories.js';

// 🔴 do qa-redteam da T-05.3 (repasse para_dono_indefinido_04112026): o check-in levava o quarto
// a OCCUPIED sem conferir o status. Com a saída atrasada (D-9) no painel "Hoje", a chegada do
// mesmo quarto entrava com um toque: dois CHECKED_IN no quarto, e o check-out do primeiro
// mandava o quarto para CLEANING (e depois à venda) com o segundo dentro.
// Regra (CLAUDE.md §3): o check-in só leva AVAILABLE → OCCUPIED, no quarto principal e nos extras.

const app = createApp();
let jwt;
let categoryId;
let guestId;
let numero = 700;

const auth = () => ({ Authorization: `Bearer ${jwt}` });
const novoQuarto = async () => (await createRoom(app, jwt, categoryId, { number: String(numero++) })).id;
const step = (id, s) => request(app).put(`/reservations/${id}/${s}`).set(auth());
const roomStatus = async (id) => (await request(app).get(`/rooms/${id}`).set(auth())).body.status;
const reservationStatus = async (id) => (await request(app).get(`/reservations/${id}`).set(auth())).body.status;

async function contasDaReserva(reservationId) {
    const [rows] = await sequelize.query(
        'SELECT count(*)::int AS n FROM accounts WHERE reservation_id = :id',
        { replacements: { id: reservationId } }
    );
    return rows[0].n;
}

beforeAll(async () => {
    await truncateAll();
    ({ jwt } = await registerAndLogin(app, { tenantName: 'Hotel Check-in Quarto' }));
    categoryId = (await createCategory(app, jwt, { price_per_night: 100 })).id;
    guestId = (await createGuest(app, jwt, { full_name: 'Hóspede Check-in' })).id;
});

describe('PUT /reservations/:id/check-in — o quarto precisa estar AVAILABLE', () => {
    it('quarto ainda ocupado (saída atrasada) → 409 com code, e nada muda', async () => {
        const roomId = await novoQuarto();
        const atrasada = await createReservation(app, jwt, guestId, roomId, { check_in_date: '2027-08-01', check_out_date: '2027-08-03' });
        expect((await step(atrasada.id, 'check-in')).status).toBe(200);
        const chegada = await createReservation(app, jwt, guestId, roomId, { check_in_date: '2027-08-03', check_out_date: '2027-08-05' });

        const res = await step(chegada.id, 'check-in');

        expect(res.status).toBe(409);
        expect(res.body.code).toBe('ROOM_NOT_AVAILABLE');
        expect(res.body.error).toMatch(/ocupado/i);
        expect(await reservationStatus(chegada.id)).toBe('PENDING');
        expect(await roomStatus(roomId)).toBe('OCCUPIED');
        expect(await contasDaReserva(chegada.id)).toBe(0);
    });

    it('quarto em limpeza → 409, a reserva segue PENDING e o quarto em CLEANING', async () => {
        const roomId = await novoQuarto();
        const anterior = await createReservation(app, jwt, guestId, roomId, { check_in_date: '2027-08-10', check_out_date: '2027-08-11' });
        expect((await step(anterior.id, 'check-in')).status).toBe(200);
        expect((await step(anterior.id, 'check-out')).status).toBe(200);
        const chegada = await createReservation(app, jwt, guestId, roomId, { check_in_date: '2027-08-11', check_out_date: '2027-08-12' });

        const res = await step(chegada.id, 'check-in');

        expect(res.status).toBe(409);
        expect(res.body.code).toBe('ROOM_NOT_AVAILABLE');
        expect(res.body.error).toMatch(/limpeza/i);
        expect(await reservationStatus(chegada.id)).toBe('PENDING');
        expect(await roomStatus(roomId)).toBe('CLEANING');
    });

    it('quarto em manutenção → 409', async () => {
        const roomId = await novoQuarto();
        const chegada = await createReservation(app, jwt, guestId, roomId, { check_in_date: '2027-08-20', check_out_date: '2027-08-21' });
        expect((await request(app).put(`/rooms/${roomId}`).set(auth()).send({ status: 'MAINTENANCE' })).status).toBe(200);

        const res = await step(chegada.id, 'check-in');

        expect(res.status).toBe(409);
        expect(res.body.code).toBe('ROOM_NOT_AVAILABLE');
        expect(res.body.error).toMatch(/manutenção/i);
        expect(await roomStatus(roomId)).toBe('MAINTENANCE');
    });

    it('quarto EXTRA não disponível → 409, e o principal continua AVAILABLE', async () => {
        const principal = await novoQuarto();
        const extra = await novoQuarto();
        const criada = await request(app).post('/reservations').set(auth()).send({
            guest_id: guestId, room_id: principal, extra_room_ids: [extra],
            check_in_date: '2027-09-01', check_out_date: '2027-09-02',
        });
        expect(criada.status).toBe(201);
        expect((await request(app).put(`/rooms/${extra}`).set(auth()).send({ status: 'MAINTENANCE' })).status).toBe(200);

        const res = await step(criada.body.id, 'check-in');

        expect(res.status).toBe(409);
        expect(res.body.code).toBe('ROOM_NOT_AVAILABLE');
        expect(await reservationStatus(criada.body.id)).toBe('PENDING');
        expect(await roomStatus(principal)).toBe('AVAILABLE');
        expect(await roomStatus(extra)).toBe('MAINTENANCE');
    });

    it('quartos disponíveis → 200, principal e extra vão a OCCUPIED (contrato de sempre)', async () => {
        const principal = await novoQuarto();
        const extra = await novoQuarto();
        const criada = await request(app).post('/reservations').set(auth()).send({
            guest_id: guestId, room_id: principal, extra_room_ids: [extra],
            check_in_date: '2027-09-10', check_out_date: '2027-09-11',
        });
        expect(criada.status).toBe(201);

        const res = await step(criada.body.id, 'check-in');

        expect(res.status).toBe(200);
        expect(res.body.status).toBe('CHECKED_IN');
        expect(await roomStatus(principal)).toBe('OCCUPIED');
        expect(await roomStatus(extra)).toBe('OCCUPIED');
    });
});
