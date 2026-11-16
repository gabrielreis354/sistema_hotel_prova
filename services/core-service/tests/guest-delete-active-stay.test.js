// Excluir hóspede com reserva ativa (decisão do Sirlande de 16/11, repasse do red team da T-08.5).
// Antes o DELETE respondia 204 com o hóspede dentro do quarto: a reserva passava a mostrar
// "Hóspede removido" no check-out e no recibo, sem volta pela tela. Agora reserva PENDING,
// CONFIRMED ou CHECKED_IN recusa com 409 (allowlist dos status que ainda seguram a estadia, a
// mesma do quarto); encerrada ou cancelada não impede.
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import sequelize from '../database/connections/sequelize.js';
import { createApp } from './helpers/createApp.js';
import { truncateAll } from './helpers/db.js';
import { registerAndLogin } from './helpers/auth.js';
import { createCategory, createRoom, createGuest, createReservation } from './helpers/factories.js';
import { stayFromToday } from './helpers/stayDates.js';

const app = createApp();
let jwt;
let categoryId;
let roomNumber = 300;

beforeAll(async () => {
    await truncateAll();
    ({ jwt } = await registerAndLogin(app, { tenantName: 'Hotel Exclusao Hospede' }));
    categoryId = (await createCategory(app, jwt)).id;
});

const auth = (r) => r.set('Authorization', `Bearer ${jwt}`);
const step = (id, s) => auth(request(app).put(`/reservations/${id}/${s}`));

/** Hóspede com uma reserva levada até `status` pelo caminho real (CONFIRMED vem do sinal pago). */
async function guestWithReservation(status) {
    const guest = await createGuest(app, jwt, { full_name: `Hospede ${status}` });
    const room = await createRoom(app, jwt, categoryId, { number: String(roomNumber++) });
    const reservation = await createReservation(app, jwt, guest.id, room.id, stayFromToday(1));
    expect(reservation.id).toBeTruthy();
    if (status === 'CONFIRMED') {
        await sequelize.query(`UPDATE reservations SET status = 'CONFIRMED' WHERE id = :id`, { replacements: { id: reservation.id } });
    }
    if (status === 'CHECKED_IN' || status === 'CHECKED_OUT') expect((await step(reservation.id, 'check-in')).status).toBe(200);
    if (status === 'CHECKED_OUT') expect((await step(reservation.id, 'check-out')).status).toBe(200);
    if (status === 'CANCELLED') expect((await step(reservation.id, 'cancel')).status).toBe(200);
    return guest;
}

const deleteGuest = (id) => auth(request(app).delete(`/guests/${id}`));

describe('DELETE /guests/:id com reserva', () => {
    it.each(['PENDING', 'CONFIRMED', 'CHECKED_IN'])('reserva %s: 409 e o hóspede continua lá', async (status) => {
        const guest = await guestWithReservation(status);
        const res = await deleteGuest(guest.id);
        expect(res.status).toBe(409);
        expect(res.body.error).toMatch(/reserva ativa/i);
        expect((await auth(request(app).get(`/guests/${guest.id}`))).status).toBe(200);
    });

    it.each(['CHECKED_OUT', 'CANCELLED'])('reserva %s: exclui (204)', async (status) => {
        const guest = await guestWithReservation(status);
        expect((await deleteGuest(guest.id)).status).toBe(204);
    });

    it('sem reserva: exclui (204), como antes', async () => {
        const guest = await createGuest(app, jwt, { full_name: 'Sem Reserva' });
        expect((await deleteGuest(guest.id)).status).toBe(204);
    });
});
