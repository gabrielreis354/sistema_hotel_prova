/**
 * Corridas entre a exclusão de quarto/categoria e quem passa a referenciá-los
 * (🟡-1 e 🟢-2 do qa-redteam de 30/10, docs/qa/redteam_tenant-fk-validation_24out2026.md).
 *
 * A FK do banco não enxerga `deleted_at`: uma reserva (ou um quarto) que leu a linha antes da
 * exclusão e grava depois dela fica apontando para um registro excluído. A trava tem de estar
 * nos DOIS lados — quem exclui trava com FOR UPDATE, quem referencia lê com FOR SHARE dentro da
 * própria transação; depois da espera, o Postgres reavalia o `deleted_at IS NULL` e a linha some.
 *
 * Cada teste segura a trava numa transação própria, na ordem que o auditor reproduziu, dispara
 * a requisição, espera ela ficar bloqueada no banco e só então solta a trava.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { QueryTypes } from 'sequelize';
import sequelize from '../database/connections/sequelize.js';
import { createApp } from './helpers/createApp.js';
import { truncateAll } from './helpers/db.js';
import { registerAndLogin } from './helpers/auth.js';
import { createCategory, createRoom, createGuest, createReservation } from './helpers/factories.js';
import RoomModel from '../app/Models/RoomModel.js';
import RoomCategoryModel from '../app/Models/RoomCategoryModel.js';
import ReservationModel from '../app/Models/ReservationModel.js';
import ReservationRoomModel from '../app/Models/ReservationRoomModel.js';

const app = createApp();
let session;
let categoryId;
let guestId;
let seq = 0;

const auth = () => ({ Authorization: `Bearer ${session.jwt}` });
const newRoom = async () => createRoom(app, session.jwt, categoryId, { number: `C${++seq}` });

// Espera alguma sessão ficar bloqueada esperando trava. Devolve false no tempo limite — sem a
// trava do lado testado a requisição pode nem bloquear, e é o resultado dela que reprova.
async function waitUntilBlocked(timeoutMs = 3000) {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
        const [{ waiting }] = await sequelize.query('SELECT count(*)::int AS waiting FROM pg_locks WHERE NOT granted', { type: QueryTypes.SELECT });
        if (waiting > 0) return true;
        await new Promise((resolve) => setTimeout(resolve, 25));
    }
    return false;
}

/**
 * Segura `lockSql` numa transação, dispara a requisição, espera o bloqueio, roda `thenSql`
 * na mesma transação e confirma. Devolve a resposta da requisição.
 */
async function whileLocked({ lockSql, thenSql = [], replacements }, fire) {
    const t = await sequelize.transaction();
    let pending;
    try {
        await sequelize.query(lockSql, { replacements, transaction: t });
        pending = fire().then((res) => res);
        await waitUntilBlocked();
        for (const sql of thenSql) {
            if (typeof sql === 'function') await sql(t);
            else await sequelize.query(sql, { replacements, transaction: t });
        }
        await t.commit();
    } catch (error) {
        if (!t.finished) await t.rollback();
        throw error;
    }
    return pending;
}

// Os passos do DeleteRoomController (já com a trava), com a requisição concorrente no meio.
const deletingRoom = (roomId, fire) => whileLocked({
    lockSql: 'SELECT id FROM rooms WHERE id = :id FOR UPDATE',
    thenSql: ['UPDATE rooms SET deleted_at = now() WHERE id = :id'],
    replacements: { id: roomId }
}, fire);

// Os passos do DeleteRoomCategoryController com a trava pedida pelo auditor.
const deletingCategory = (id, fire) => whileLocked({
    lockSql: 'SELECT id FROM room_categories WHERE id = :id FOR UPDATE',
    thenSql: ['UPDATE room_categories SET deleted_at = now() WHERE id = :id'],
    replacements: { id }
}, fire);

const pivotsOf = (roomId) => ReservationRoomModel.count({ where: { room_id: roomId } });

beforeAll(async () => {
    await truncateAll();
    session = await registerAndLogin(app, { tenantName: 'Hotel Corridas' });
    categoryId = (await createCategory(app, session.jwt, { name: 'Corrida', price_per_night: '100.00' })).id;
    guestId = (await createGuest(app, session.jwt, { email: 'corrida@race.test' })).id;
});

describe('🟡-1 — quarto excluído enquanto uma reserva o referencia', () => {
    it('POST /reservations para o quarto que está sendo excluído → 404, e nenhuma reserva fica com ele', async () => {
        const room = await newRoom();
        const res = await deletingRoom(room.id, () => request(app).post('/reservations').set(auth()).send({
            guest_id: guestId, room_id: room.id, check_in_date: '2028-05-01', check_out_date: '2028-05-03'
        }));
        expect(res.status).toBe(404);
        expect(await pivotsOf(room.id)).toBe(0);
    });

    it('POST /reservations com o quarto EXTRA sendo excluído → 404', async () => {
        const main = await newRoom();
        const extra = await newRoom();
        const res = await deletingRoom(extra.id, () => request(app).post('/reservations').set(auth()).send({
            guest_id: guestId, room_id: main.id, extra_room_ids: [extra.id], check_in_date: '2028-05-05', check_out_date: '2028-05-07'
        }));
        expect(res.status).toBe(404);
        expect(await pivotsOf(extra.id)).toBe(0);
    });

    it('POST /reservations/:id/rooms com o quarto sendo excluído → 404, e o pivô não ganha a linha', async () => {
        const main = await newRoom();
        const extra = await newRoom();
        const reservation = await createReservation(app, session.jwt, guestId, main.id, { check_in_date: '2028-06-01', check_out_date: '2028-06-03' });
        const res = await deletingRoom(extra.id, () => request(app).post(`/reservations/${reservation.id}/rooms`).set(auth()).send({ room_id: extra.id }));
        expect(res.status).toBe(404);
        expect(await pivotsOf(extra.id)).toBe(0);
    });

    it('PUT /reservations/:id trocando para o quarto que está sendo excluído → 404, e o quarto não muda', async () => {
        const main = await newRoom();
        const target = await newRoom();
        const reservation = await createReservation(app, session.jwt, guestId, main.id, { check_in_date: '2028-07-01', check_out_date: '2028-07-03' });
        const res = await deletingRoom(target.id, () => request(app).put(`/reservations/${reservation.id}`).set(auth()).send({ room_id: target.id }));
        expect(res.status).toBe(404);
        expect((await ReservationModel.findByPk(reservation.id)).room_id).toBe(main.id);
    });

    it('PUT /contracts/:id/sign com quarto sendo excluído → 404, e o contrato não é assinado', async () => {
        const room = await newRoom();
        const client = (await request(app).post('/corporate-clients').set(auth()).send({ razao_social: 'Corrida LTDA', representante_nome: 'Rep' })).body;
        const contract = (await request(app).post('/contracts').set(auth()).send({
            corporate_client_id: client.id, objeto: 'Evento', check_in: '2028-08-01', check_out: '2028-08-03',
            pessoas: 2, total: 400, testemunha_1: 'T1', testemunha_2: 'T2'
        })).body;
        const res = await deletingRoom(room.id, () => request(app).put(`/contracts/${contract.id}/sign`).set(auth()).send({ room_ids: [room.id] }));
        expect(res.status).toBe(404);
        expect((await request(app).get(`/contracts/${contract.id}`).set(auth())).body.status).toBe('GENERATED');
        expect(await pivotsOf(room.id)).toBe(0);
    });
});

describe('🟡-1 — categoria excluída enquanto um quarto passa a usá-la', () => {
    it('POST /rooms com a categoria sendo excluída → 404 CATEGORY_NOT_FOUND, e nenhum quarto é criado', async () => {
        const cat = await createCategory(app, session.jwt, { name: 'Some no meio', price_per_night: '90.00' });
        const res = await deletingCategory(cat.id, () => request(app).post('/rooms').set(auth()).send({ category_id: cat.id, number: 'CX1' }));
        expect(res.status).toBe(404);
        expect(res.body.code).toBe('CATEGORY_NOT_FOUND');
        expect(await RoomModel.count({ where: { category_id: cat.id } })).toBe(0);
    });

    it('PUT /rooms/:id trocando para a categoria sendo excluída → 404 CATEGORY_NOT_FOUND, e a categoria do quarto não muda', async () => {
        const room = await newRoom();
        const cat = await createCategory(app, session.jwt, { name: 'Some na troca', price_per_night: '90.00' });
        const res = await deletingCategory(cat.id, () => request(app).put(`/rooms/${room.id}`).set(auth()).send({ category_id: cat.id }));
        expect(res.status).toBe(404);
        expect(res.body.code).toBe('CATEGORY_NOT_FOUND');
        expect((await RoomModel.findByPk(room.id)).category_id).toBe(categoryId);
    });

    it('DELETE /room-categories/:id enquanto um quarto está sendo criado nela → espera e responde 409 CATEGORY_IN_USE', async () => {
        const cat = await createCategory(app, session.jwt, { name: 'Ganha quarto', price_per_night: '90.00' });
        // Os passos do CreateRoomController (já com FOR SHARE na categoria) com o DELETE no meio.
        const res = await whileLocked({
            lockSql: 'SELECT id FROM room_categories WHERE id = :id FOR SHARE',
            thenSql: [(t) => RoomModel.create({ tenant_id: session.tenantId, category_id: cat.id, number: 'CX2', status: 'AVAILABLE' }, { transaction: t })],
            replacements: { id: cat.id }
        }, () => request(app).delete(`/room-categories/${cat.id}`).set(auth()));
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('CATEGORY_IN_USE');
        expect(await RoomCategoryModel.findByPk(cat.id)).not.toBeNull();
    });
});

describe('🟢-2 — as travas FOR UPDATE do UpdateRoom e do DeleteRoom (mutações M5 e M6)', () => {
    it('M5: edição concorrente com um check-in não sobrescreve o OCCUPIED (409, e o quarto segue OCCUPIED)', async () => {
        const room = await newRoom();
        // O check-in muda o status do quarto dentro da transação dele; a edição chega no meio.
        const res = await whileLocked({
            lockSql: "UPDATE rooms SET status = 'OCCUPIED' WHERE id = :id",
            replacements: { id: room.id }
        }, () => request(app).put(`/rooms/${room.id}`).set(auth()).send({ status: 'MAINTENANCE' }));
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('ROOM_STATUS_TRANSITION_NOT_ALLOWED');
        expect((await RoomModel.findByPk(room.id)).status).toBe('OCCUPIED');
    });

    it('M6: DELETE /rooms/:id enquanto uma reserva está sendo gravada para ele → espera e responde 409 ROOM_IN_USE', async () => {
        const room = await newRoom();
        // Os passos do CreateReservationController (já com FOR SHARE no quarto) com o DELETE no meio.
        const res = await whileLocked({
            lockSql: 'SELECT id FROM rooms WHERE id = :id FOR SHARE',
            thenSql: [(t) => ReservationModel.create({
                tenant_id: session.tenantId, guest_id: guestId, room_id: room.id, user_id: session.userId,
                check_in_date: '2028-09-01', check_out_date: '2028-09-03', status: 'PENDING', total_amount: '200.00'
            }, { transaction: t })],
            replacements: { id: room.id }
        }, () => request(app).delete(`/rooms/${room.id}`).set(auth()));
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('ROOM_IN_USE');
        expect(await RoomModel.findByPk(room.id)).not.toBeNull();
    });
});
