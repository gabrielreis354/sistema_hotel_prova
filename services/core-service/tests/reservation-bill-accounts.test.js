// T-04.5 — GET /reservations/:id/bill soma as contas da reserva (CA-04.5.a a c).
//
// Decisões (anexo SPEC-04-decisoes-T-04.5.md):
//   D-54 diária que nenhuma conta cobra fica no bill da reserva (reserva antes do check-in
//        não tem conta até a T-04.6);
//   D-55 com conta de diária, room_total é a soma das diárias das contas — a gravada no
//        fechamento vale sobre o total_amount atual (D-39);
//   D-56 total_paid e total_pending seguem vindo dos pagamentos da reserva;
//   D-57 leitura numa transação REPEATABLE READ só de leitura, sem trava.
//
// O contrato é o de tests/bill-consumptions.test.js, que não muda (CA-04.5.c).
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from './helpers/createApp.js';
import { truncateAll } from './helpers/db.js';
import { registerAndLogin } from './helpers/auth.js';
import { createCategory, createRoom, createGuest, createReservation } from './helpers/factories.js';
import AccountModel from '../app/Models/AccountModel.js';
import { toCents } from '../app/utils/calculateStayTotal.js';

const app = createApp();
const auth = (token) => ({ Authorization: `Bearer ${token}` });

let jwt, otherJwt;
let standard, luxo; // 200 e 300 por noite
let guest;
let roomNumber = 900;

const newRoom = async (category = standard) => {
    roomNumber += 1;
    return createRoom(app, jwt, category.id, { number: String(roomNumber) });
};

let month = 0;
const nextDates = (nights) => {
    month += 1;
    const m = String((month % 12) + 1).padStart(2, '0');
    const year = 2040 + Math.floor(month / 12);
    return { check_in_date: `${year}-${m}-01`, check_out_date: `${year}-${m}-${String(1 + nights).padStart(2, '0')}` };
};

const openAccount = async (body) => {
    const res = await request(app).post('/accounts').set(auth(jwt)).send(body);
    if (res.status !== 201) throw new Error(`abrir conta falhou: ${res.status} ${JSON.stringify(res.body)}`);
    return res.body;
};

const addItem = async (accountId, body) => {
    const res = await request(app).post(`/accounts/${accountId}/items`).set(auth(jwt)).send(body);
    if (res.status !== 201) throw new Error(`lançar item falhou: ${res.status} ${JSON.stringify(res.body)}`);
    return res.body.item;
};

const payOk = async (body) => {
    const res = await request(app).post('/payments').set(auth(jwt)).send({ method: 'DINHEIRO', ...body });
    if (res.status !== 201) throw new Error(`pagamento falhou: ${res.status} ${JSON.stringify(res.body)}`);
    return res.body;
};

const accountBill = async (accountId) => {
    const res = await request(app).get(`/accounts/${accountId}/bill`).set(auth(jwt));
    if (res.status !== 200) throw new Error(`bill da conta falhou: ${res.status} ${JSON.stringify(res.body)}`);
    return res.body;
};

const reservationBill = async (reservationId) => {
    const res = await request(app).get(`/reservations/${reservationId}/bill`).set(auth(jwt));
    if (res.status !== 200) throw new Error(`bill da reserva falhou: ${res.status} ${JSON.stringify(res.body)}`);
    return res.body;
};

async function checkIn(reservationId) {
    const res = await request(app).put(`/reservations/${reservationId}/check-in`).set(auth(jwt));
    if (res.status !== 200) throw new Error(`check-in falhou: ${res.status} ${JSON.stringify(res.body)}`);
}

// toCents não lê negativo: o saldo da conta pode ser.
const signedCents = (v) => (String(v).startsWith('-') ? -toCents(String(v).slice(1)) : toCents(v));
const cents = (n) => Math.round(n * 100);

/** CA-04.5.a: os totais do bill da reserva são as somas das contas dela. */
async function expectSumOfAccounts(reservationId) {
    const accounts = await AccountModel.findAll({ where: { reservation_id: reservationId } });
    const bills = await Promise.all(accounts.map((a) => accountBill(a.id)));
    const sum = (field) => bills.reduce((acc, b) => acc + signedCents(b[field]), 0);
    const body = await reservationBill(reservationId);
    expect(cents(body.room_total)).toBe(sum('room_charges'));
    expect(cents(body.consumptions_total)).toBe(sum('consumptions'));
    expect(cents(body.grand_total)).toBe(sum('total'));
    expect(cents(body.balance_due)).toBe(sum('balance'));
    return body;
}

/** Multiquarto 3 noites: luxo (900) + standard (600) = 1500, com conta em cada quarto. */
async function splitStay() {
    const main = await newRoom(luxo);
    const extra = await newRoom(standard);
    const res = await request(app).post('/reservations').set(auth(jwt)).send({
        guest_id: guest.id, room_id: main.id, extra_room_ids: [extra.id], ...nextDates(3)
    });
    if (res.status !== 201) throw new Error(`reserva falhou: ${res.status} ${JSON.stringify(res.body)}`);
    await checkIn(res.body.id);
    const a = await openAccount({ type: 'ROOM', guest_id: guest.id, reservation_id: res.body.id, room_id: main.id, label: 'Luxo' });
    const b = await openAccount({ type: 'ROOM', guest_id: guest.id, reservation_id: res.body.id, room_id: extra.id, label: 'Standard' });
    return { reservation: res.body, a, b };
}

beforeAll(async () => {
    await truncateAll();
    ({ jwt } = await registerAndLogin(app, { tenantName: 'Hotel Bill Reserva' }));
    ({ jwt: otherJwt } = await registerAndLogin(app, { tenantName: 'Hotel Bill Vizinho' }));
    standard = await createCategory(app, jwt, { name: 'Standard BR', price_per_night: 200 });
    luxo = await createCategory(app, jwt, { name: 'Luxo BR', price_per_night: 300 });
    guest = await createGuest(app, jwt, { full_name: 'Bruno Reserva', email: `bruno_br_${Date.now()}@test.com` });
});

describe('Contrato de resposta (CA-04.5.b)', () => {
    it('mesmos campos e mesmos tipos de antes', async () => {
        const room = await newRoom();
        const reservation = await createReservation(app, jwt, guest.id, room.id, nextDates(2));
        const body = await reservationBill(reservation.id);

        expect(Object.keys(body).sort()).toEqual([
            'balance_due', 'check_in_date', 'check_out_date', 'consumptions', 'consumptions_total',
            'fully_paid', 'grand_total', 'guest', 'payments', 'reservation_id', 'room_total',
            'status', 'total_paid', 'total_pending'
        ]);
        for (const field of ['room_total', 'consumptions_total', 'grand_total', 'total_paid', 'total_pending', 'balance_due']) {
            expect(typeof body[field]).toBe('number');
        }
        expect(typeof body.fully_paid).toBe('boolean');
    });
});

describe('Reserva sem conta de diária (D-54)', () => {
    it('sem conta nenhuma: diária é o total da reserva', async () => {
        const room = await newRoom();
        const reservation = await createReservation(app, jwt, guest.id, room.id, nextDates(2)); // 2 × 200
        const body = await reservationBill(reservation.id);
        expect(body).toMatchObject({ room_total: 400, consumptions_total: 0, grand_total: 400, balance_due: 400 });
    });

    it('só conta que não cobra diária: a diária continua na reserva e o consumo da conta entra', async () => {
        const room = await newRoom();
        const reservation = await createReservation(app, jwt, guest.id, room.id, nextDates(2));
        await checkIn(reservation.id);
        const companion = await openAccount({
            type: 'ROOM', guest_id: guest.id, reservation_id: reservation.id, room_id: room.id,
            label: 'Acompanhante', charges_lodging: false
        });
        await addItem(companion.id, { description: 'Suco', unit_price: '8.00' });

        const body = await reservationBill(reservation.id);
        expect(body).toMatchObject({ room_total: 400, consumptions_total: 8, grand_total: 408, balance_due: 408 });
    });

    it('sinal pago sem conta: abate do saldo', async () => {
        const room = await newRoom();
        const reservation = await createReservation(app, jwt, guest.id, room.id, nextDates(2));
        await payOk({ reservation_id: reservation.id, amount: 150 });
        const body = await reservationBill(reservation.id);
        expect(body).toMatchObject({ total_paid: 150, balance_due: 250, fully_paid: false });
    });

    it('reserva cancelada sem conta: diária 0, o sinal vira saldo a devolver (D-46)', async () => {
        const room = await newRoom();
        const reservation = await createReservation(app, jwt, guest.id, room.id, nextDates(2));
        await payOk({ reservation_id: reservation.id, amount: 100 });
        const cancel = await request(app).put(`/reservations/${reservation.id}/cancel`).set(auth(jwt));
        expect(cancel.status).toBe(200);
        const body = await reservationBill(reservation.id);
        expect(body).toMatchObject({ room_total: 0, grand_total: 0, total_paid: 100, balance_due: -100, fully_paid: true });
    });
});

describe('Bill da reserva = soma das contas (CA-04.5.a)', () => {
    it('duas contas, itens em cada uma, cortesia e pagamentos', async () => {
        const { reservation, a, b } = await splitStay();
        await addItem(a.id, { description: 'Vinho', unit_price: '90.00' });
        await addItem(a.id, { description: 'Bolo', unit_price: '20.00', billable: false, reason: 'COURTESY' });
        await addItem(b.id, { description: 'Água', quantity: 3, unit_price: '5.50' });
        await payOk({ reservation_id: reservation.id, amount: 300 }); // crédito da reserva (D-45)
        await payOk({ account_id: b.id, reservation_id: reservation.id, amount: 100 });

        const body = await expectSumOfAccounts(reservation.id);
        expect(body).toMatchObject({
            room_total: 1500, consumptions_total: 106.5, grand_total: 1606.5,
            total_paid: 400, balance_due: 1206.5, fully_paid: false
        });
        // A lista de consumos traz os itens faturáveis de todas as contas, e só eles.
        expect(body.consumptions.map((c) => c.description).sort()).toEqual(['Vinho', 'Água']);
    });

    it('pagamento a maior: soma dos saldos negativa = balance_due negativo', async () => {
        const { reservation } = await splitStay();
        await payOk({ reservation_id: reservation.id, amount: 1600 });
        const body = await expectSumOfAccounts(reservation.id);
        expect(body).toMatchObject({ balance_due: -100, fully_paid: true });
    });

    it('diária gravada na conta fechada vale sobre o total_amount atual (D-55, D-39)', async () => {
        const room = await newRoom();
        const reservation = await createReservation(app, jwt, guest.id, room.id, nextDates(2)); // 400
        await checkIn(reservation.id);
        const account = await openAccount({
            type: 'ROOM', guest_id: guest.id, reservation_id: reservation.id, room_id: room.id, label: 'Suíte'
        });
        // Conta apresentada com 350 (estado que a API não gera hoje, mas que a D-39 protege:
        // o que foi apresentado não muda). O bill da reserva tem de mostrar o mesmo.
        await AccountModel.update(
            { status: 'CLOSED', closed_at: new Date(), closed_room_charges: '350.00' },
            { where: { id: account.id } }
        );

        const body = await expectSumOfAccounts(reservation.id);
        expect(body).toMatchObject({ room_total: 350, grand_total: 350, balance_due: 350 });
    });

    it('lançamentos e pagamentos em paralelo: no fim, a soma das contas bate', async () => {
        const { reservation, a, b } = await splitStay();
        await Promise.all([
            addItem(a.id, { description: 'Cerveja', quantity: 2, unit_price: '12.50' }),
            addItem(b.id, { description: 'Porção', unit_price: '45.90' }),
            payOk({ reservation_id: reservation.id, amount: 200 }),
            payOk({ account_id: a.id, reservation_id: reservation.id, amount: 70.1 }),
            reservationBill(reservation.id)
        ]);
        const body = await expectSumOfAccounts(reservation.id);
        expect(body).toMatchObject({ consumptions_total: 70.9, total_paid: 270.1, balance_due: 1300.8 });
    });
});

describe('O que não muda', () => {
    it('reserva de outro hotel → 404', async () => {
        const room = await newRoom();
        const reservation = await createReservation(app, jwt, guest.id, room.id, nextDates(1));
        const res = await request(app).get(`/reservations/${reservation.id}/bill`).set(auth(otherJwt));
        expect(res.status).toBe(404);
    });
});
