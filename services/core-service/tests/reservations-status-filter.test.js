import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from './helpers/createApp.js';
import { truncateAll } from './helpers/db.js';
import { registerAndLogin } from './helpers/auth.js';
import { createCategory, createRoom, createGuest, createReservation } from './helpers/factories.js';

// T-05.3 — o painel "Hoje" pede as reservas por situação, recortadas no servidor:
//   ?status=CHECKED_IN                                → hóspedes na casa (inclui saída atrasada)
//   ?from=HOJE&to=HOJE&status=PENDING,CONFIRMED       → chegadas do dia e em atraso
// Sem isso a tela teria de baixar reservas fora da janela e filtrar no cliente.

const app = createApp();
let jwt;
let otherJwt;
const ids = {};

function list(query, token = jwt) {
    return request(app).get('/reservations').query(query).set('Authorization', `Bearer ${token}`);
}

beforeAll(async () => {
    await truncateAll();
    ({ jwt } = await registerAndLogin(app, { tenantName: 'Hotel Filtro Status' }));
    ({ jwt: otherJwt } = await registerAndLogin(app, { tenantName: 'Outro Hotel Filtro' }));

    const cat = await createCategory(app, jwt, { price_per_night: 100 });
    const rooms = [];
    for (const n of ['301', '302', '303', '304']) rooms.push((await createRoom(app, jwt, cat.id, { number: n })).id);
    const guest = (await createGuest(app, jwt, { full_name: 'Hóspede Filtro' })).id;

    // PENDING
    ids.pending = (await createReservation(app, jwt, guest, rooms[0], { check_in_date: '2027-05-10', check_out_date: '2027-05-12' })).id;
    // CHECKED_IN
    ids.checkedIn = (await createReservation(app, jwt, guest, rooms[1], { check_in_date: '2027-05-10', check_out_date: '2027-05-14' })).id;
    expect((await request(app).put(`/reservations/${ids.checkedIn}/check-in`).set('Authorization', `Bearer ${jwt}`)).status).toBe(200);
    // CANCELLED
    ids.cancelled = (await createReservation(app, jwt, guest, rooms[2], { check_in_date: '2027-05-10', check_out_date: '2027-05-11' })).id;
    expect((await request(app).put(`/reservations/${ids.cancelled}/cancel`).set('Authorization', `Bearer ${jwt}`)).status).toBe(200);
    // PENDING fora da janela de 10/05
    ids.later = (await createReservation(app, jwt, guest, rooms[3], { check_in_date: '2027-06-01', check_out_date: '2027-06-03' })).id;

    // Outro hotel com uma reserva CHECKED_IN — não pode aparecer.
    const oCat = await createCategory(app, otherJwt, { price_per_night: 100 });
    const oRoom = (await createRoom(app, otherJwt, oCat.id, { number: '301' })).id;
    const oGuest = (await createGuest(app, otherJwt, { full_name: 'Hóspede Outro' })).id;
    ids.other = (await createReservation(app, otherJwt, oGuest, oRoom, { check_in_date: '2027-05-10', check_out_date: '2027-05-12' })).id;
    await request(app).put(`/reservations/${ids.other}/check-in`).set('Authorization', `Bearer ${otherJwt}`);
});

describe('GET /reservations?status=', () => {
    it('cada item traz room.status, para o painel avisar antes do toque (🟡-3 da T-05.3)', async () => {
        const res = await list({ status: 'CHECKED_IN' });
        expect(res.status).toBe(200);
        expect(res.body.data.find((r) => r.id === ids.checkedIn).room.status).toBe('OCCUPIED');
    });

    it('filtra por um status', async () => {
        const res = await list({ status: 'CHECKED_IN' });
        expect(res.status).toBe(200);
        expect(res.body.map((r) => r.id)).toEqual([ids.checkedIn]);
    });

    it('aceita lista separada por vírgula', async () => {
        const res = await list({ status: 'PENDING,CANCELLED' });
        expect(res.status).toBe(200);
        expect(res.body.map((r) => r.id).sort()).toEqual([ids.pending, ids.cancelled, ids.later].sort());
    });

    it('combina com from/to (sobreposição ao dia)', async () => {
        const res = await list({ from: '2027-05-10', to: '2027-05-10', status: 'PENDING,CONFIRMED' });
        expect(res.status).toBe(200);
        expect(res.body.map((r) => r.id)).toEqual([ids.pending]);
    });

    it('combina com a paginação, com total coerente', async () => {
        const res = await list({ status: 'PENDING', page: 1, limit: 1 });
        expect(res.status).toBe(200);
        expect(res.body.total).toBe(2);
        expect(res.body.data).toHaveLength(1);
        expect(res.body.data[0].status).toBe('PENDING');
    });

    it.each(['FOO', '', 'PENDING,FOO', 'pending', ','])('status inválido (%j) → 400 com os permitidos', async (status) => {
        const res = await list({ status });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/PENDING, CONFIRMED, CHECKED_IN, CHECKED_OUT, CANCELLED/);
    });

    it('status repetido na query (?status=A&status=B) → 400, não 500', async () => {
        const res = await request(app).get('/reservations?status=PENDING&status=CONFIRMED').set('Authorization', `Bearer ${jwt}`);
        expect(res.status).toBe(400);
    });

    it('nunca devolve reserva de outro hotel', async () => {
        const res = await list({ status: 'CHECKED_IN' });
        expect(res.body.map((r) => r.id)).not.toContain(ids.other);
        const theirs = await list({ status: 'CHECKED_IN' }, otherJwt);
        expect(theirs.body.map((r) => r.id)).toEqual([ids.other]);
    });

    it('sem status o contrato não muda: array puro com todas as reservas do hotel', async () => {
        const res = await list({});
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body).toHaveLength(4);
    });
});
