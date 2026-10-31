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
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import request from 'supertest';
import { QueryTypes, DatabaseError } from 'sequelize';
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
        // Os passos do CreateReservationController (já com FOR KEY SHARE no quarto) com o DELETE no meio.
        const res = await whileLocked({
            lockSql: 'SELECT id FROM rooms WHERE id = :id FOR KEY SHARE',
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

describe('🟡-1 (mesma classe) — reserva pública e conta avulsa com o quarto sendo excluído', () => {
    it('POST /public/:subdomain/bookings com o único quarto da categoria sendo excluído → 409 sem disponibilidade, e nenhuma reserva fica com ele', async () => {
        const cat = await createCategory(app, session.jwt, { name: 'Site única', capacity: 2, price_per_night: '120.00' });
        const room = await createRoom(app, session.jwt, cat.id, { number: 'WEB1' });
        const res = await deletingRoom(room.id, () => request(app).post(`/public/${session.subdomain}/bookings`).send({
            category_id: cat.id, check_in: '2028-10-01', check_out: '2028-10-03', guests: 1,
            guest: { full_name: 'Hóspede do Site', email: 'site@race.test' }
        }));
        expect(res.status).toBe(409);
        // Mensagem do contrato público de sempre — nada de quarto, trava ou detalhe interno.
        expect(res.body).toEqual({ error: 'Sem disponibilidade na categoria para o período' });
        expect(await pivotsOf(room.id)).toBe(0);
    });

    it('POST /accounts (DAY_USE) com o quarto sendo excluído → 404, e nenhuma conta aponta para ele', async () => {
        const room = await newRoom();
        const res = await deletingRoom(room.id, () => request(app).post('/accounts').set(auth()).send({
            type: 'DAY_USE', label: 'Day use corrida', room_id: room.id
        }));
        expect(res.status).toBe(404);
        const [{ total }] = await sequelize.query('SELECT count(*)::int AS total FROM accounts WHERE room_id = :id', { replacements: { id: room.id }, type: QueryTypes.SELECT });
        expect(total).toBe(0);
    });
});

describe('🟡-D1 — a leitura com trava não entra em deadlock com o UPDATE de status do check-in/check-out', () => {
    it('POST /reservations (X principal, Y extra) no meio de um check-in que muda Y e depois X → 201, e o check-in também grava', async () => {
        const x = await newRoom();
        const y = await newRoom();
        // O CheckInController de uma reserva com Y principal e X extra: UPDATE de Y, segura, e o
        // UPDATE de X só depois que a criação já está esperando. Com FOR SHARE a criação trava X,
        // espera Y, e o UPDATE de X fecha o ciclo: o Postgres derruba um dos lados (40P01).
        // FOR KEY SHARE não conflita com um UPDATE que não muda a chave, como o de status.
        const res = await whileLocked({
            lockSql: "UPDATE rooms SET status = 'OCCUPIED' WHERE id = :y",
            thenSql: ["UPDATE rooms SET status = 'OCCUPIED' WHERE id = :x"],
            replacements: { x: x.id, y: y.id }
        }, () => request(app).post('/reservations').set(auth()).send({
            guest_id: guestId, room_id: x.id, extra_room_ids: [y.id], check_in_date: '2028-11-01', check_out_date: '2028-11-03'
        }));
        expect(res.status).toBe(201);
        expect((await RoomModel.findByPk(x.id)).status).toBe('OCCUPIED');
        expect(await pivotsOf(y.id)).toBe(1);
    });

    it('a leitura com trava continua esperando a exclusão do quarto (FOR KEY SHARE conflita com FOR UPDATE) → 404', async () => {
        const room = await newRoom();
        const res = await deletingRoom(room.id, () => request(app).post('/reservations').set(auth()).send({
            guest_id: guestId, room_id: room.id, check_in_date: '2028-11-05', check_out_date: '2028-11-07'
        }));
        expect(res.status).toBe(404);
        expect(await pivotsOf(room.id)).toBe(0);
    });
});

describe('🟢-D2 — deadlock (40P01) não vira "Quarto indisponível"', () => {
    const deadlock = () => new DatabaseError(Object.assign(new Error('deadlock detected'), { code: '40P01' }));
    // Rejeita `Model.create` com deadlock nas `times` primeiras chamadas.
    const deadlockOnCreate = (Model, times) => {
        const original = Model.create.bind(Model);
        let thrown = 0;
        vi.spyOn(Model, 'create').mockImplementation((...args) => {
            if (thrown < times) {
                thrown += 1;
                return Promise.reject(deadlock());
            }
            return original(...args);
        });
        return () => thrown;
    };
    afterEach(() => vi.restoreAllMocks());

    it('POST /reservations: deadlock na 1ª tentativa → tenta de novo e cria (201)', async () => {
        const room = await newRoom();
        const thrown = deadlockOnCreate(ReservationModel, 1);
        const res = await request(app).post('/reservations').set(auth()).send({
            guest_id: guestId, room_id: room.id, check_in_date: '2028-12-01', check_out_date: '2028-12-03'
        });
        expect(thrown()).toBe(1);
        expect(res.status).toBe(201);
        expect(await pivotsOf(room.id)).toBe(1);
    });

    it('POST /reservations: deadlock repetido → 409 "tente de novo", nunca "Quarto indisponível", e nada é gravado', async () => {
        const room = await newRoom();
        deadlockOnCreate(ReservationModel, Infinity);
        const res = await request(app).post('/reservations').set(auth()).send({
            guest_id: guestId, room_id: room.id, check_in_date: '2028-12-05', check_out_date: '2028-12-07'
        });
        expect(res.status).toBe(409);
        expect(res.body.error).toMatch(/tente de novo/i);
        expect(res.body.error).not.toMatch(/indisponível/i);
        vi.restoreAllMocks();
        expect(await pivotsOf(room.id)).toBe(0);
    });

    it('POST /reservations/:id/rooms: deadlock na 1ª tentativa → tenta de novo e vincula (201)', async () => {
        const main = await newRoom();
        const extra = await newRoom();
        const reservation = await createReservation(app, session.jwt, guestId, main.id, { check_in_date: '2028-12-10', check_out_date: '2028-12-12' });
        deadlockOnCreate(ReservationRoomModel, 1);
        const res = await request(app).post(`/reservations/${reservation.id}/rooms`).set(auth()).send({ room_id: extra.id });
        expect(res.status).toBe(201);
        expect(await pivotsOf(extra.id)).toBe(1);
    });

    it('reserva pública: deadlock não vira "Quarto indisponível" — 500 genérico, sem repetir (a cobrança já foi criada)', async () => {
        const cat = await createCategory(app, session.jwt, { name: 'Site deadlock', capacity: 2, price_per_night: '120.00' });
        const room = await createRoom(app, session.jwt, cat.id, { number: 'WEB-DL' });
        deadlockOnCreate(ReservationModel, Infinity);
        const res = await request(app).post(`/public/${session.subdomain}/bookings`).send({
            category_id: cat.id, check_in: '2028-12-15', check_out: '2028-12-17', guests: 1,
            guest: { full_name: 'Hóspede Deadlock', email: 'deadlock@race.test' }
        });
        expect(res.status).toBe(500);
        expect(res.body).toEqual({ error: 'Erro interno do servidor' });
        vi.restoreAllMocks();
        expect(await pivotsOf(room.id)).toBe(0);
    });
});
