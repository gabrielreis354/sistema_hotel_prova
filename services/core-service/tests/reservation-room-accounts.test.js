// Repasse do qa-redteam ao Gabriel de 19/10 (docs/qa/repasses/para_gabriel_19102026.md):
// a troca e a remoção de quarto precisam levar junto as contas do quarto que sai.
//
// - Troca do quarto principal (PUT /reservations/:id): a conta ROOM ABERTA do quarto que sai
//   passa a apontar para o quarto novo, na mesma transação (RN-005 / D-3, D-5).
// - Remoção de quarto extra (DELETE /reservations/:id/rooms/:roomId): as contas abertas do
//   extra vão para o quarto principal; se ele já tem conta de diária, a movida deixa de cobrar
//   diária (RN-005). Nenhuma conta é apagada e a remoção não é bloqueada por conta aberta
//   (🟡-1 e 🟡-2 da auditoria qa-redteam de 21/10).
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import request from 'supertest';
import { createApp } from './helpers/createApp.js';
import { truncateAll } from './helpers/db.js';
import { registerAndLogin } from './helpers/auth.js';
import { createCategory, createRoom, createGuest } from './helpers/factories.js';
import AccountModel from '../app/Models/AccountModel.js';
import ReservationRoomModel from '../app/Models/ReservationRoomModel.js';

const app = createApp();
const auth = (token) => ({ Authorization: `Bearer ${token}` });

let jwt, tenantId, otherJwt;
let standard, luxo; // 200 e 300 por noite
let guest;
let roomNumber = 900;

const newRoom = async (category = standard) => {
    roomNumber += 1;
    return createRoom(app, jwt, category.id, { number: String(roomNumber) });
};

// Datas distintas por reserva: os quartos não colidem no EXCLUDE de ocupação.
let month = 0;
const nextDates = (nights) => {
    month += 1;
    const m = String((month % 12) + 1).padStart(2, '0');
    const year = 2030 + Math.floor(month / 12);
    return { check_in_date: `${year}-${m}-01`, check_out_date: `${year}-${m}-${String(1 + nights).padStart(2, '0')}` };
};

const checkIn = async (reservationId) => {
    const res = await request(app).put(`/reservations/${reservationId}/check-in`).set(auth(jwt));
    if (res.status !== 200) throw new Error(`check-in falhou: ${res.status} ${JSON.stringify(res.body)}`);
};

// Reserva já CHECKED_IN: conta ROOM pelo /accounts exige check-in feito (T-04.1).
const reserve = async (mainRoom, extras = [], nights = 2) => {
    const res = await request(app).post('/reservations').set(auth(jwt)).send({
        guest_id: guest.id, room_id: mainRoom.id, extra_room_ids: extras.map((r) => r.id), ...nextDates(nights)
    });
    if (res.status !== 201) throw new Error(`reserva falhou: ${res.status} ${JSON.stringify(res.body)}`);
    await checkIn(res.body.id);
    return res.body;
};

const openAccount = async (body) => {
    const res = await request(app).post('/accounts').set(auth(jwt)).send({ type: 'ROOM', guest_id: guest.id, ...body });
    if (res.status !== 201) throw new Error(`abrir conta falhou: ${res.status} ${JSON.stringify(res.body)}`);
    return res.body;
};

const addItem = async (accountId, body) => {
    const res = await request(app).post(`/accounts/${accountId}/items`).set(auth(jwt)).send(body);
    if (res.status !== 201) throw new Error(`lançar item falhou: ${res.status} ${JSON.stringify(res.body)}`);
    return res.body.item;
};

const getBill = (accountId) => request(app).get(`/accounts/${accountId}/bill`).set(auth(jwt));
const swapRoom = (reservationId, roomId, token = jwt) =>
    request(app).put(`/reservations/${reservationId}`).set(auth(token)).send({ room_id: roomId });
const removeRoom = (reservationId, roomId, token = jwt) =>
    request(app).delete(`/reservations/${reservationId}/rooms/${roomId}`).set(auth(token));
const reload = (id) => AccountModel.findByPk(id, { paranoid: false });

beforeAll(async () => {
    await truncateAll();
    ({ jwt, tenantId } = await registerAndLogin(app, { tenantName: 'Hotel Contas do Quarto' }));
    ({ jwt: otherJwt } = await registerAndLogin(app, { tenantName: 'Hotel Contas Vizinho' }));
    standard = await createCategory(app, jwt, { name: 'Standard RA', price_per_night: 200 });
    luxo = await createCategory(app, jwt, { name: 'Luxo RA', price_per_night: 300 });
    guest = await createGuest(app, jwt, { full_name: 'Ana Troca', email: `ana_troca_${Date.now()}@test.com` });
});

describe('PUT /reservations/:id — troca do quarto principal leva a conta aberta (repasse 19/10)', () => {
    it('cenário do repasse: CHECKED_IN, conta da suíte, troca → a conta vai para o quarto novo e o bill segue com a diária', async () => {
        const oldRoom = await newRoom();
        const room = await newRoom();
        const reservation = await reserve(oldRoom); // 2 × 200 = 400, CHECKED_IN
        const account = await openAccount({ reservation_id: reservation.id, room_id: oldRoom.id, label: `Suíte ${oldRoom.number}` });
        await addItem(account.id, { description: 'Frigobar', unit_price: '15.00' });

        const swap = await swapRoom(reservation.id, room.id);
        expect(swap.status).toBe(200);

        // A conta acompanha a troca na mesma requisição — não espera o próximo lançamento (D-32).
        const moved = await reload(account.id);
        expect(moved.room_id).toBe(room.id);
        expect(moved.label).toBe(`Suíte ${room.number}`); // rótulo do sistema acompanha

        const bill = await getBill(account.id);
        expect(bill.body).toMatchObject({ room_id: room.id, room_charges: '400.00', consumptions: '15.00', total: '415.00' });

        // E a recepção não consegue abrir uma segunda conta cobrando diária no quarto novo.
        const second = await request(app).post('/accounts').set(auth(jwt)).send({
            type: 'ROOM', guest_id: guest.id, reservation_id: reservation.id, room_id: room.id, label: 'Outra'
        });
        expect(second.status).toBe(422);
        expect(await AccountModel.count({ where: { reservation_id: reservation.id, charges_lodging: true } })).toBe(1);
    });

    it('rótulo escolhido pela recepção não é sobrescrito; conta sem diária do mesmo quarto também acompanha', async () => {
        const oldRoom = await newRoom();
        const room = await newRoom();
        const reservation = await reserve(oldRoom);
        const lodging = await openAccount({ reservation_id: reservation.id, room_id: oldRoom.id, label: 'Família Souza' });
        const companion = await openAccount({
            reservation_id: reservation.id, room_id: oldRoom.id, label: 'Acompanhante', charges_lodging: false
        });

        expect((await swapRoom(reservation.id, room.id)).status).toBe(200);

        expect(await reload(lodging.id)).toMatchObject({ room_id: room.id, label: 'Família Souza' });
        expect((await reload(companion.id)).room_id).toBe(room.id);
    });

    it('conta fechada não muda de quarto (D-23, D-39)', async () => {
        const oldRoom = await newRoom();
        const room = await newRoom();
        const reservation = await reserve(oldRoom);
        const closed = await openAccount({ reservation_id: reservation.id, room_id: oldRoom.id, label: 'Fechada', charges_lodging: false });
        expect((await request(app).put(`/accounts/${closed.id}/close`).set(auth(jwt))).status).toBe(200);

        expect((await swapRoom(reservation.id, room.id)).status).toBe(200);

        expect(await reload(closed.id)).toMatchObject({ room_id: oldRoom.id, status: 'CLOSED' });
    });

    it('contas dos quartos extras não são tocadas pela troca do principal', async () => {
        const oldRoom = await newRoom();
        const extra = await newRoom(luxo);
        const room = await newRoom();
        const reservation = await reserve(oldRoom, [extra]);
        const extraAccount = await openAccount({ reservation_id: reservation.id, room_id: extra.id, label: 'Extra' });

        expect((await swapRoom(reservation.id, room.id)).status).toBe(200);

        expect((await reload(extraAccount.id)).room_id).toBe(extra.id);
    });

    it('troca recusada (409 por conflito) não mexe na conta', async () => {
        const oldRoom = await newRoom();
        const busy = await newRoom();
        const dates = nextDates(2);
        const blocker = await request(app).post('/reservations').set(auth(jwt)).send({ guest_id: guest.id, room_id: busy.id, ...dates });
        expect(blocker.status).toBe(201);
        const reservation = await request(app).post('/reservations').set(auth(jwt)).send({ guest_id: guest.id, room_id: oldRoom.id, ...dates });
        await checkIn(reservation.body.id);
        const account = await openAccount({ reservation_id: reservation.body.id, room_id: oldRoom.id, label: 'Fica' });

        expect((await swapRoom(reservation.body.id, busy.id)).status).toBe(409);

        expect((await reload(account.id)).room_id).toBe(oldRoom.id);
    });

    it('dado legado: o quarto novo já tem conta de diária desta reserva → 409 (RN-005), nada muda', async () => {
        const first = await newRoom();
        const second = await newRoom();
        const reservation = await reserve(first);
        const current = await openAccount({ reservation_id: reservation.id, room_id: first.id, label: 'Atual' });
        // Estado de antes da correção: uma troca 'second' → 'first' deixou a conta de diária
        // antiga para trás, no quarto 'second' (gravada direto no banco).
        const stale = await AccountModel.create({
            tenant_id: tenantId, type: 'ROOM', reservation_id: reservation.id, room_id: second.id,
            guest_id: guest.id, label: 'Legada', charges_lodging: true
        });

        const res = await swapRoom(reservation.id, second.id);

        expect(res.status).toBe(409);
        expect(res.body.error).toMatch(/RN-005/);
        // 🟢-2 da auditoria de 21/10: diz qual conta bloqueia, e não manda "fechar" (D-41).
        expect(res.body.account_ids).toEqual([stale.id]);
        expect(res.body.error).not.toMatch(/feche/i);
        expect((await reload(current.id)).room_id).toBe(first.id);
        expect((await reload(stale.id)).room_id).toBe(second.id);
        expect((await request(app).get(`/reservations/${reservation.id}`).set(auth(jwt))).body.room_id).toBe(first.id);
    });

    it('tenant isolation: outro hotel não troca o quarto nem move a conta (404)', async () => {
        const oldRoom = await newRoom();
        const room = await newRoom();
        const reservation = await reserve(oldRoom);
        const account = await openAccount({ reservation_id: reservation.id, room_id: oldRoom.id, label: 'Isolada' });

        expect((await swapRoom(reservation.id, room.id, otherJwt)).status).toBe(404);

        expect((await reload(account.id)).room_id).toBe(oldRoom.id);
    });
});

describe('DELETE /reservations/:id/rooms/:roomId — quarto extra com conta (repasse 19/10)', () => {
    const lodgingCount = (reservationId) =>
        AccountModel.count({ where: { reservation_id: reservationId, charges_lodging: true } });

    it('🟡-1: a única conta de diária está no extra (vazia) → vai para o principal e segue cobrando a diária', async () => {
        const main = await newRoom();
        const extra = await newRoom();
        const reservation = await reserve(main, [extra]); // (200 + 200) × 2 = 800, CHECKED_IN
        const onlyAccount = await openAccount({ reservation_id: reservation.id, room_id: extra.id, label: `Suíte ${extra.number}` });
        expect((await getBill(onlyAccount.id)).body.room_charges).toBe('800.00');

        expect((await removeRoom(reservation.id, extra.id)).status).toBe(204);

        // Nenhuma conta apagada, e a diária da estadia (2 × 200) continua numa conta.
        expect(await reload(onlyAccount.id)).toMatchObject({
            room_id: main.id, charges_lodging: true, deleted_at: null, status: 'OPEN', label: `Suíte ${main.number}`
        });
        expect(await lodgingCount(reservation.id)).toBe(1);
        expect((await getBill(onlyAccount.id)).body.room_charges).toBe('400.00');
    });

    it('🟡-2: conta com consumo no extra e o principal já tem conta de diária → a remoção passa, a conta vai para o principal sem diária', async () => {
        const main = await newRoom();
        const extra = await newRoom(luxo);
        const reservation = await reserve(main, [extra]); // (200 + 300) × 2 = 1000, CHECKED_IN
        const mainAccount = await openAccount({ reservation_id: reservation.id, room_id: main.id, label: 'Principal' });
        const extraAccount = await openAccount({ reservation_id: reservation.id, room_id: extra.id, label: 'Família Souza' });
        await addItem(extraAccount.id, { description: 'Frigobar', unit_price: '15.00' });

        expect((await removeRoom(reservation.id, extra.id)).status).toBe(204);

        // Vira conta dividida da suíte principal (D-5), com o consumo intacto; RN-005 preservada.
        expect(await reload(extraAccount.id)).toMatchObject({
            room_id: main.id, charges_lodging: false, deleted_at: null, label: 'Família Souza'
        });
        expect((await getBill(extraAccount.id)).body).toMatchObject({ room_charges: '0.00', consumptions: '15.00', total: '15.00' });
        expect(await lodgingCount(reservation.id)).toBe(1);
        // Total novo (2 × 200) inteiro na conta do principal — nenhuma diária perdida nem dobrada.
        expect((await getBill(mainAccount.id)).body.room_charges).toBe('400.00');
        expect(await ReservationRoomModel.count({ where: { reservation_id: reservation.id, room_id: extra.id } })).toBe(0);
    });

    it('conta com pagamento no extra: vai para o principal com o pagamento junto', async () => {
        const main = await newRoom();
        const extra = await newRoom();
        const reservation = await reserve(main, [extra]);
        const extraAccount = await openAccount({ reservation_id: reservation.id, room_id: extra.id, label: 'Extra com sinal', charges_lodging: false });
        const payment = await request(app).post('/payments').set(auth(jwt))
            .send({ account_id: extraAccount.id, amount: '50.00', method: 'DINHEIRO' });
        expect(payment.status).toBe(201);

        expect((await removeRoom(reservation.id, extra.id)).status).toBe(204);

        expect(await reload(extraAccount.id)).toMatchObject({ room_id: main.id, charges_lodging: false, deleted_at: null });
        expect((await getBill(extraAccount.id)).body.payments_made).toBe('50.00');
    });

    it('conta fechada no extra não muda, nem bloqueia a remoção (D-23)', async () => {
        const main = await newRoom();
        const extra = await newRoom();
        const reservation = await reserve(main, [extra]);
        const closed = await openAccount({ reservation_id: reservation.id, room_id: extra.id, label: 'Extra fechada', charges_lodging: false });
        await addItem(closed.id, { description: 'Café', unit_price: '12.00' });
        expect((await request(app).put(`/accounts/${closed.id}/close`).set(auth(jwt))).status).toBe(200);

        expect((await removeRoom(reservation.id, extra.id)).status).toBe(204);
        expect(await reload(closed.id)).toMatchObject({ status: 'CLOSED', deleted_at: null, room_id: extra.id });
    });

    it('tenant isolation: outro hotel não remove o quarto nem move a conta (404)', async () => {
        const main = await newRoom();
        const extra = await newRoom();
        const reservation = await reserve(main, [extra]);
        const extraAccount = await openAccount({ reservation_id: reservation.id, room_id: extra.id, label: 'Extra isolada' });

        expect((await removeRoom(reservation.id, extra.id, otherJwt)).status).toBe(404);
        expect(await reload(extraAccount.id)).toMatchObject({ room_id: extra.id, deleted_at: null });
    });
});

describe('POST /accounts/:id/items — conta que some entre a leitura e a trava (🟢-1 da auditoria de 21/10)', () => {
    afterEach(() => vi.restoreAllMocks());

    it('a releitura com trava não acha a conta → 404, nunca 500, e nada é gravado', async () => {
        const room = await newRoom();
        const reservation = await reserve(room);
        const account = await openAccount({ reservation_id: reservation.id, room_id: room.id, label: 'Some no meio' });
        // Simula a conta excluída por outra transação depois da 1ª leitura: só a leitura com
        // trava (a de dentro da transação) volta vazia.
        const original = AccountModel.findOne.bind(AccountModel);
        vi.spyOn(AccountModel, 'findOne').mockImplementation((options, ...rest) =>
            (options?.lock ? Promise.resolve(null) : original(options, ...rest)));

        const res = await request(app).post(`/accounts/${account.id}/items`).set(auth(jwt))
            .send({ description: 'Água', unit_price: '6.00' });

        expect(res.status).toBe(404);
        vi.restoreAllMocks();
        expect((await getBill(account.id)).body.items).toHaveLength(0);
    });
});
