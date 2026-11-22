import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import sequelize from '../database/connections/sequelize.js';
import { createApp } from './helpers/createApp.js';
import { truncateAll } from './helpers/db.js';
import { registerAndLogin } from './helpers/auth.js';
import { createCategory, createRoom, createGuest } from './helpers/factories.js';
import { addDays } from './helpers/stayDates.js';
import { todayInHotel } from '../app/utils/hotelTimezone.js';
import { CHECK_IN_IN_PAST, checkInInPast } from '../app/utils/checkInDateGuard.js';

// SPEC-11, T-11.2 (CA-11.f): o PMS criava reserva com entrada no passado (201). Entrada antes de
// hoje, no fuso do hotel, dá 422 na criação e na troca de datas; hoje continua valendo (walk-in).
// Parecer do Sirlande de 22/11 (🟡1): no PUT só barra quando a ENTRADA muda — estender a saída de
// quem está na casa desde ontem, ou trocar o quarto da chegada atrasada, continua 200.

const HOJE = todayInHotel();
const ONTEM = addDays(HOJE, -1);

describe('checkInInPast — a regra pura', () => {
    it('antes de hoje barra; hoje e depois, não', () => {
        expect(checkInInPast(ONTEM, HOJE)).toBe(true);
        expect(checkInInPast(HOJE, HOJE)).toBe(false);
        expect(checkInInPast(addDays(HOJE, 3), HOJE)).toBe(false);
    });

    it('na troca de datas, entrada que não mudou não barra, mesmo no passado', () => {
        expect(checkInInPast(ONTEM, HOJE, ONTEM)).toBe(false);
        expect(checkInInPast(addDays(HOJE, -5), HOJE, ONTEM)).toBe(true);
    });

    it('"hoje" é o do hotel: 01:30 UTC de 23/11 ainda é 22/11 em São Paulo', () => {
        const hojeNoHotel = todayInHotel(new Date('2026-11-23T01:30:00Z'));
        expect(hojeNoHotel).toBe('2026-11-22');
        expect(checkInInPast('2026-11-22', hojeNoHotel)).toBe(false);
        expect(checkInInPast('2026-11-21', hojeNoHotel)).toBe(true);
    });
});

const app = createApp();
let jwt;
let guestId;
let categoryId;
let numero = 810;
const auth = () => ({ Authorization: `Bearer ${jwt}` });
const novoQuarto = async () => (await createRoom(app, jwt, categoryId, { number: String(numero++) })).id;
const criar = (body) => request(app).post('/reservations').set(auth()).send(body);
const alterar = (id, body) => request(app).put(`/reservations/${id}`).set(auth()).send(body);

/** Reserva criada hoje e levada para "entrou ontem" por SQL, porque a API não cria no passado. */
async function reservaDesdeOntem({ checkIn = false } = {}) {
    const room = await novoQuarto();
    const res = await criar({ guest_id: guestId, room_id: room, check_in_date: HOJE, check_out_date: addDays(HOJE, 2) });
    expect(res.status).toBe(201);
    if (checkIn) expect((await request(app).put(`/reservations/${res.body.id}/check-in`).set(auth())).status).toBe(200);
    await sequelize.query('UPDATE reservations SET check_in_date = :ontem WHERE id = :id', { replacements: { ontem: ONTEM, id: res.body.id } });
    return res.body.id;
}

beforeAll(async () => {
    await truncateAll();
    ({ jwt } = await registerAndLogin(app, { tenantName: 'Hotel Entrada Passada' }));
    categoryId = (await createCategory(app, jwt, { price_per_night: 100 })).id;
    guestId = (await createGuest(app, jwt, { full_name: 'Hóspede Passado' })).id;
});

describe('POST /reservations — entrada no passado', () => {
    it('entrada ontem → 422 com code e a data em dd/mm/aaaa, sem gravar', async () => {
        const room = await novoQuarto();
        const res = await criar({ guest_id: guestId, room_id: room, check_in_date: ONTEM, check_out_date: addDays(HOJE, 2) });
        expect(res.status).toBe(422);
        expect(res.body.code).toBe(CHECK_IN_IN_PAST);
        expect(res.body.error).toContain(ONTEM.split('-').reverse().join('/'));
        const [rows] = await sequelize.query('SELECT count(*)::int AS n FROM reservations WHERE room_id = :room', { replacements: { room } });
        expect(rows[0].n).toBe(0);
    });

    it('entrada hoje (walk-in) → 201', async () => {
        const res = await criar({ guest_id: guestId, room_id: await novoQuarto(), check_in_date: HOJE, check_out_date: addDays(HOJE, 1) });
        expect(res.status).toBe(201);
    });

    it('campos faltando continuam 400 antes da regra de data', async () => {
        const res = await criar({ room_id: await novoQuarto(), check_in_date: ONTEM, check_out_date: HOJE });
        expect(res.status).toBe(400);
    });
});

describe('PUT /reservations/:id — troca de datas', () => {
    it('mover a entrada para antes de hoje → 422 e a reserva fica como estava', async () => {
        const room = await novoQuarto();
        const id = (await criar({ guest_id: guestId, room_id: room, check_in_date: addDays(HOJE, 3), check_out_date: addDays(HOJE, 5) })).body.id;
        const res = await alterar(id, { check_in_date: ONTEM });
        expect(res.status).toBe(422);
        expect(res.body.code).toBe(CHECK_IN_IN_PAST);
        const atual = (await request(app).get(`/reservations/${id}`).set(auth())).body;
        expect(atual.check_in_date).toBe(addDays(HOJE, 3));
    });

    it('estender a saída de quem está na casa desde ontem (CHECKED_IN) → 200', async () => {
        const id = await reservaDesdeOntem({ checkIn: true });
        const res = await alterar(id, { check_out_date: addDays(HOJE, 4) });
        expect(res.status).toBe(200);
        expect(res.body.check_out_date).toBe(addDays(HOJE, 4));
    });

    it('chegada atrasada PENDING, reenviando a mesma entrada de ontem e trocando a saída → 200', async () => {
        const id = await reservaDesdeOntem();
        const res = await alterar(id, { check_in_date: ONTEM, check_out_date: addDays(HOJE, 3) });
        expect(res.status).toBe(200);
    });

    it('chegada atrasada PENDING trocando de quarto → 200', async () => {
        const id = await reservaDesdeOntem();
        const res = await alterar(id, { room_id: await novoQuarto() });
        expect(res.status).toBe(200);
    });

    it('entrada movida para hoje → 200', async () => {
        const id = (await criar({ guest_id: guestId, room_id: await novoQuarto(), check_in_date: addDays(HOJE, 3), check_out_date: addDays(HOJE, 5) })).body.id;
        expect((await alterar(id, { check_in_date: HOJE })).status).toBe(200);
    });
});
