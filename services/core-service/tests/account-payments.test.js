// T-04.4 — Payment ↔ Account (CA-04.4.a a e).
//
// Decisões aprovadas em 19/10 (anexo SPEC-04-decisoes-T-04.4.md):
//   1. Pagamento da reserva sem conta (sinal PIX, pagamento atual da recepção) entra na
//      conta titular: a conta de diária mais antiga da reserva.
//   2. Só CLOSED → PAID, quando há pagamento e o saldo fica ≤ 0. Se o saldo volta a ficar
//      positivo, PAID → CLOSED. Conta OPEN paga continua OPEN e vira PAID ao fechar.
//   3. Pagamento a maior é aceito: o saldo fica negativo (o hotel deve devolver).
//      Conta PAID e conta INTERNAL não recebem pagamento.
//
// Invariante testada em cada transição (lição do qa-redteam da T-04.3): a soma dos saldos
// das contas da reserva é igual ao saldo do bill da reserva.
import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import sequelize from '../database/connections/sequelize.js';
import { createApp } from './helpers/createApp.js';
import { truncateAll } from './helpers/db.js';
import { registerAndLogin } from './helpers/auth.js';
import { createCategory, createRoom, createGuest, createReservation } from './helpers/factories.js';
import AccountModel from '../app/Models/AccountModel.js';
import PaymentModel from '../app/Models/PaymentModel.js';
import getPixProvider from '../app/services/pix/index.js';
import { fromCents, toCents } from '../app/utils/calculateStayTotal.js';

const app = createApp();
const auth = (token) => ({ Authorization: `Bearer ${token}` });

let jwt, tenantId, otherJwt;
let standard, luxo; // 200 e 300 por noite
let guest;
let roomNumber = 500;

const newRoom = async (category = standard) => {
    roomNumber += 1;
    return createRoom(app, jwt, category.id, { number: String(roomNumber) });
};

let month = 0;
const nextDates = (nights) => {
    month += 1;
    const m = String((month % 12) + 1).padStart(2, '0');
    const year = 2030 + Math.floor(month / 12);
    return { check_in_date: `${year}-${m}-01`, check_out_date: `${year}-${m}-${String(1 + nights).padStart(2, '0')}` };
};

const openAccount = async (body, token = jwt) => {
    const res = await request(app).post('/accounts').set(auth(token)).send(body);
    if (res.status !== 201) throw new Error(`abrir conta falhou: ${res.status} ${JSON.stringify(res.body)}`);
    return res.body;
};

const addItem = async (accountId, body) => {
    const res = await request(app).post(`/accounts/${accountId}/items`).set(auth(jwt)).send(body);
    if (res.status !== 201) throw new Error(`lançar item falhou: ${res.status} ${JSON.stringify(res.body)}`);
    return res.body.item;
};

const pay = (body, token = jwt) => request(app).post('/payments').set(auth(token)).send({ method: 'DINHEIRO', ...body });

const payOk = async (body) => {
    const res = await pay(body);
    if (res.status !== 201) throw new Error(`pagamento falhou: ${res.status} ${JSON.stringify(res.body)}`);
    return res.body;
};

const bill = async (accountId) => {
    const res = await request(app).get(`/accounts/${accountId}/bill`).set(auth(jwt));
    if (res.status !== 200) throw new Error(`bill falhou: ${res.status} ${JSON.stringify(res.body)}`);
    return res.body;
};

const close = async (accountId) => {
    const res = await request(app).put(`/accounts/${accountId}/close`).set(auth(jwt));
    if (res.status !== 200) throw new Error(`fechar falhou: ${res.status} ${JSON.stringify(res.body)}`);
    return res.body;
};

const reload = (id) => AccountModel.findByPk(id);

async function checkIn(reservationId) {
    const res = await request(app).put(`/reservations/${reservationId}/check-in`).set(auth(jwt));
    if (res.status !== 200) throw new Error(`check-in falhou: ${res.status} ${JSON.stringify(res.body)}`);
}

async function checkOut(reservationId) {
    const res = await request(app).put(`/reservations/${reservationId}/check-out`).set(auth(jwt));
    if (res.status !== 200) throw new Error(`check-out falhou: ${res.status} ${JSON.stringify(res.body)}`);
}

/** Estadia com check-in feito e a conta da suíte (cobra diária) aberta. */
async function stayWithAccount({ nights = 2, category = standard } = {}) {
    const room = await newRoom(category);
    const reservation = await createReservation(app, jwt, guest.id, room.id, nextDates(nights));
    await checkIn(reservation.id);
    const account = await openAccount({
        type: 'ROOM', reservation_id: reservation.id, room_id: room.id, guest_id: guest.id, label: `Suíte ${room.number}`
    });
    return { room, reservation, account };
}

/** Soma dos saldos das contas da reserva = saldo do bill da reserva. */
async function expectAccountsMatchReservation(reservationId) {
    const accounts = await AccountModel.findAll({ where: { reservation_id: reservationId } });
    let sum = 0;
    for (const a of accounts) sum += toSignedCents((await bill(a.id)).balance);
    const res = await request(app).get(`/reservations/${reservationId}/bill`).set(auth(jwt));
    expect(res.status).toBe(200);
    expect(sum).toBe(Math.round(res.body.balance_due * 100));
}

// toCents não lê negativo (só aceita valores ≥ 0): o saldo pode ser.
const toSignedCents = (value) => (String(value).startsWith('-') ? -toCents(String(value).slice(1)) : toCents(value));

beforeAll(async () => {
    await truncateAll();
    ({ jwt, tenantId } = await registerAndLogin(app, { tenantName: 'Hotel Pagamento da Conta' }));
    ({ jwt: otherJwt } = await registerAndLogin(app, { tenantName: 'Hotel Pagamento Vizinho' }));
    standard = await createCategory(app, jwt, { name: 'Standard Pag', price_per_night: 200 });
    luxo = await createCategory(app, jwt, { name: 'Luxo Pag', price_per_night: 300 });
    guest = await createGuest(app, jwt, { full_name: 'Ana Pagante', email: `ana_pag_${Date.now()}@test.com` });
});

describe('fromCents com valor negativo (saldo a devolver)', () => {
    it('formata o sinal uma vez só, também abaixo de 1 real', () => {
        expect(fromCents(-150)).toBe('-1.50');
        expect(fromCents(-5)).toBe('-0.05');
        expect(fromCents(-12345)).toBe('-123.45');
        expect(fromCents(0)).toBe('0.00');
        expect(fromCents(150)).toBe('1.50');
    });
});

describe('Banco: payments com account_id (CA-04.4.a e b)', () => {
    let dayUse, stay;

    beforeAll(async () => {
        dayUse = await openAccount({ type: 'DAY_USE', guest_id: guest.id, label: 'Piscina — Ana' });
        stay = await stayWithAccount();
    });

    const insertPayment = (over) => sequelize.query(
        `INSERT INTO payments (id, tenant_id, reservation_id, account_id, amount, method, status, kind, created_at, updated_at)
         VALUES (:id, :tenant_id, :reservation_id, :account_id, 10, 'DINHEIRO', 'PAID', 'FULL', now(), now())`,
        { replacements: { id: randomUUID(), tenant_id: tenantId, reservation_id: null, account_id: null, ...over } }
    );

    // Primeiro do bloco: o SET NOT NULL falha se algum pagamento sem reserva já existir.
    it('applyDbConstraints tira o NOT NULL de reservation_id que o sync deixa num banco antigo', async () => {
        const { default: applyDbConstraints } = await import('../database/applyDbConstraints.js');
        await sequelize.query('ALTER TABLE payments ALTER COLUMN reservation_id SET NOT NULL');
        await applyDbConstraints(sequelize);
        const [[{ is_nullable }]] = await sequelize.query(
            `SELECT is_nullable FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'reservation_id'`
        );
        expect(is_nullable).toBe('YES');
    });

    it('CA-04.4.b: recusa pagamento sem reserva e sem conta', async () => {
        await expect(insertPayment({})).rejects.toThrow(/payments_reservation_or_account/);
    });

    it('CA-04.4.a: aceita pagamento só com a conta (day-use não tem reserva)', async () => {
        await expect(insertPayment({ account_id: dayUse.id })).resolves.toBeDefined();
    });

    it('recusa pagamento que aponta para a conta de outra reserva', async () => {
        const other = await stayWithAccount();
        await expect(insertPayment({ account_id: stay.account.id, reservation_id: other.reservation.id }))
            .rejects.toThrow(/payments_account_consistency/);
    });

    it('recusa pagamento da conta da suíte sem a reserva', async () => {
        await expect(insertPayment({ account_id: stay.account.id }))
            .rejects.toThrow(/payments_account_consistency/);
    });

    it('recusa pagamento com o tenant diferente do da conta', async () => {
        const [[other]] = await sequelize.query(`SELECT id FROM tenants WHERE id <> :tenantId LIMIT 1`, { replacements: { tenantId } });
        await expect(insertPayment({ account_id: dayUse.id, tenant_id: other.id }))
            .rejects.toThrow(/payments_account_consistency/);
    });
});

describe('POST /payments com account_id (CA-04.4.a)', () => {
    it('day-use: grava a conta e deixa reservation_id nulo', async () => {
        const account = await openAccount({ type: 'DAY_USE', guest_id: guest.id, label: 'Piscina' });
        const res = await pay({ account_id: account.id, amount: '20.00' });

        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({ account_id: account.id, reservation_id: null, amount: '20.00' });
    });

    it('conta da suíte: o servidor preenche reservation_id a partir da conta', async () => {
        const { reservation, account } = await stayWithAccount();
        const res = await pay({ account_id: account.id, amount: '50.00' });

        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({ account_id: account.id, reservation_id: reservation.id });
    });

    it('aceita reservation_id igual ao da conta', async () => {
        const { reservation, account } = await stayWithAccount();
        const res = await pay({ account_id: account.id, reservation_id: reservation.id, amount: '10.00' });
        expect(res.status).toBe(201);
    });

    it('422 quando reservation_id não é a reserva da conta', async () => {
        const { account } = await stayWithAccount();
        const other = await stayWithAccount();
        const res = await pay({ account_id: account.id, reservation_id: other.reservation.id, amount: '10.00' });

        expect(res.status).toBe(422);
        expect(await PaymentModel.count({ where: { account_id: account.id } })).toBe(0);
    });

    it('422 quando manda reservation_id para conta sem reserva', async () => {
        const account = await openAccount({ type: 'DIRECT', label: 'Balcão' });
        const { reservation } = await stayWithAccount();
        const res = await pay({ account_id: account.id, reservation_id: reservation.id, amount: '10.00' });
        expect(res.status).toBe(422);
    });

    it('400 com valor negativo, zero ou com mais de 2 casas (🟡-4)', async () => {
        const account = await openAccount({ type: 'DIRECT', label: 'Balcão valor' });
        for (const amount of ['-50', -50, '0', 0, '10.001', 'abc']) {
            const res = await pay({ account_id: account.id, amount });
            expect(res.status, `amount ${amount}`).toBe(400);
        }
        const { reservation } = await stayWithAccount({ nights: 1 });
        expect((await pay({ reservation_id: reservation.id, amount: '-1.00' })).status).toBe(400);
        expect(await PaymentModel.count({ where: { account_id: account.id } })).toBe(0);
    });

    it('PUT com valor negativo → 400, e o pagamento não muda (🟡-4)', async () => {
        const account = await openAccount({ type: 'DIRECT', label: 'Balcão put' });
        const payment = await payOk({ account_id: account.id, amount: '10.00' });
        const res = await request(app).put(`/payments/${payment.id}`).set(auth(jwt)).send({ amount: '-10.00' });

        expect(res.status).toBe(400);
        expect((await PaymentModel.findByPk(payment.id)).amount).toBe('10.00');
    });

    it('o banco recusa valor negativo (CHECK payments_amount_check)', async () => {
        const account = await openAccount({ type: 'DIRECT', label: 'Balcão check' });
        await expect(PaymentModel.create({ tenant_id: tenantId, account_id: account.id, amount: '-1.00', method: 'DINHEIRO' }))
            .rejects.toThrow(/payments_amount_check/);
    });

    it('reservation_id que não é UUID → 404; em maiúsculas é a mesma reserva (🟢-3)', async () => {
        const { reservation, account } = await stayWithAccount({ nights: 1 });
        expect((await pay({ reservation_id: 'nao-e-uuid', amount: '10.00' })).status).toBe(404);
        expect((await pay({ account_id: account.id, reservation_id: 'nao-e-uuid', amount: '10.00' })).status).toBe(404);

        const res = await pay({ account_id: account.id, reservation_id: reservation.id.toUpperCase(), amount: '10.00' });
        expect(res.status).toBe(201);
        expect(res.body.reservation_id).toBe(reservation.id);
    });

    it('400 sem reserva e sem conta', async () => {
        const res = await pay({ amount: '10.00' });
        expect(res.status).toBe(400);
    });

    it('404 com conta inexistente, de outro tenant ou id inválido', async () => {
        const mine = await openAccount({ type: 'DIRECT', label: 'Balcão vizinho' }, otherJwt);

        expect((await pay({ account_id: randomUUID(), amount: '10.00' })).status).toBe(404);
        expect((await pay({ account_id: mine.id, amount: '10.00' })).status).toBe(404);
        expect((await pay({ account_id: 'nao-e-uuid', amount: '10.00' })).status).toBe(404);
    });

    it('422 em conta INTERNAL: nunca é receita (RN-006)', async () => {
        const account = await openAccount({ type: 'INTERNAL', label: 'Refeição da equipe' });
        const res = await pay({ account_id: account.id, amount: '10.00' });

        expect(res.status).toBe(422);
        expect(await PaymentModel.count({ where: { account_id: account.id } })).toBe(0);
    });
});

describe('Bill da conta com pagamentos e transição para PAID (CA-04.4.c)', () => {
    it('pagamento parcial: payments_made e balance reais, conta segue OPEN', async () => {
        const account = await openAccount({ type: 'DAY_USE', guest_id: guest.id, label: 'Piscina parcial' });
        await addItem(account.id, { description: 'Almoço', unit_price: '50.00' });
        await payOk({ account_id: account.id, amount: '20.00' });

        const b = await bill(account.id);
        expect(b).toMatchObject({ status: 'OPEN', total: '50.00', payments_made: '20.00', balance: '30.00' });
    });

    it('conta aberta paga por inteiro continua OPEN e vira PAID ao fechar', async () => {
        const account = await openAccount({ type: 'DAY_USE', guest_id: guest.id, label: 'Piscina adiantada' });
        await addItem(account.id, { description: 'Almoço', unit_price: '40.00' });
        await payOk({ account_id: account.id, amount: '40.00' });

        expect((await reload(account.id)).status).toBe('OPEN');
        const closed = await close(account.id);
        expect(closed).toMatchObject({ status: 'PAID', balance: '0.00' });
        expect((await reload(account.id)).status).toBe('PAID');
    });

    it('conta fechada: pagamento parcial mantém CLOSED, o que quita vira PAID', async () => {
        const account = await openAccount({ type: 'TABLE', label: 'Mesa 3' });
        await addItem(account.id, { description: 'Jantar', unit_price: '90.00' });
        await close(account.id);

        await payOk({ account_id: account.id, amount: '30.00' });
        expect((await reload(account.id)).status).toBe('CLOSED');

        await payOk({ account_id: account.id, amount: '60.00' });
        expect((await reload(account.id)).status).toBe('PAID');
        expect(await bill(account.id)).toMatchObject({ status: 'PAID', payments_made: '90.00', balance: '0.00' });
    });

    it('pagamento a maior fica com saldo negativo e a conta PAID', async () => {
        const account = await openAccount({ type: 'TABLE', label: 'Mesa 4' });
        await addItem(account.id, { description: 'Café', unit_price: '10.00' });
        await close(account.id);
        await payOk({ account_id: account.id, amount: '15.00' });

        expect(await bill(account.id)).toMatchObject({ status: 'PAID', payments_made: '15.00', balance: '-5.00' });
    });

    it('conta PAID não recebe pagamento (422)', async () => {
        const account = await openAccount({ type: 'TABLE', label: 'Mesa 5' });
        await addItem(account.id, { description: 'Café', unit_price: '10.00' });
        await close(account.id);
        await payOk({ account_id: account.id, amount: '10.00' });

        const res = await pay({ account_id: account.id, amount: '1.00' });
        expect(res.status).toBe(422);
        expect(await PaymentModel.count({ where: { account_id: account.id } })).toBe(1);
    });

    it('conta PAID não recebe item (D-23 vale para PAID)', async () => {
        const account = await openAccount({ type: 'TABLE', label: 'Mesa 6' });
        await addItem(account.id, { description: 'Café', unit_price: '10.00' });
        await close(account.id);
        await payOk({ account_id: account.id, amount: '10.00' });

        const res = await request(app).post(`/accounts/${account.id}/items`).set(auth(jwt))
            .send({ description: 'Bolo', unit_price: '8.00' });
        expect(res.status).toBe(422);
    });

    it('conta INTERNAL: o banco recusa pagamento direto, e ela fecha CLOSED (🟢-4)', async () => {
        const account = await openAccount({ type: 'INTERNAL', label: 'Perda de estoque' });
        await expect(PaymentModel.create({ tenant_id: tenantId, account_id: account.id, amount: '10.00', method: 'DINHEIRO' }))
            .rejects.toThrow(/payments_account_consistency/);
        const closed = await close(account.id);

        expect(closed).toMatchObject({ status: 'CLOSED', total: '0.00', payments_made: '0.00' });
    });

    it('conta fechada com total 0 e sem pagamento continua CLOSED', async () => {
        const account = await openAccount({ type: 'TABLE', label: 'Mesa vazia' });
        const closed = await close(account.id);
        expect(closed.status).toBe('CLOSED');
    });

    it('só pagamento PAID conta: cobrança PENDING, FAILED ou excluída não quita', async () => {
        const account = await openAccount({ type: 'TABLE', label: 'Mesa 7' });
        await addItem(account.id, { description: 'Jantar', unit_price: '30.00' });
        await close(account.id);
        for (const status of ['PENDING', 'FAILED', 'EXPIRED']) {
            await PaymentModel.create({ tenant_id: tenantId, account_id: account.id, amount: '30.00', method: 'PIX', status });
        }
        const deleted = await PaymentModel.create({ tenant_id: tenantId, account_id: account.id, amount: '30.00', method: 'PIX' });
        await deleted.destroy();

        expect(await bill(account.id)).toMatchObject({ status: 'CLOSED', payments_made: '0.00', balance: '30.00' });
    });
});

describe('Pagamento excluído ou alterado devolve a conta a CLOSED', () => {
    let account, payment;

    beforeAll(async () => {
        account = await openAccount({ type: 'TABLE', label: 'Mesa 8' });
        await addItem(account.id, { description: 'Jantar', unit_price: '70.00' });
        await close(account.id);
        payment = await payOk({ account_id: account.id, amount: '70.00' });
    });

    it('alterar o valor para menos volta para CLOSED; para o total, PAID de novo', async () => {
        expect((await reload(account.id)).status).toBe('PAID');

        let res = await request(app).put(`/payments/${payment.id}`).set(auth(jwt)).send({ amount: '50.00' });
        expect(res.status).toBe(200);
        expect(await bill(account.id)).toMatchObject({ status: 'CLOSED', balance: '20.00' });

        res = await request(app).put(`/payments/${payment.id}`).set(auth(jwt)).send({ amount: '70.00' });
        expect(res.status).toBe(200);
        expect((await reload(account.id)).status).toBe('PAID');
    });

    it('excluir o pagamento volta para CLOSED', async () => {
        const res = await request(app).delete(`/payments/${payment.id}`).set(auth(jwt));
        expect(res.status).toBe(204);
        expect(await bill(account.id)).toMatchObject({ status: 'CLOSED', payments_made: '0.00', balance: '70.00' });
    });
});

describe('Pagamento da reserva entra na conta titular (decisão 1)', () => {
    it('o pagamento sem conta entra na conta de diária; a conta sem diária não recebe', async () => {
        const { reservation, room, account } = await stayWithAccount({ nights: 2 }); // 400
        const bar = await openAccount({
            type: 'ROOM', reservation_id: reservation.id, room_id: room.id, guest_id: guest.id,
            label: 'Bar — Ana', charges_lodging: false
        });
        await addItem(bar.id, { description: 'Drink', unit_price: '25.00' });
        await payOk({ reservation_id: reservation.id, amount: '100.00' });

        expect(await bill(account.id)).toMatchObject({ room_charges: '400.00', payments_made: '100.00', balance: '300.00' });
        expect(await bill(bar.id)).toMatchObject({ payments_made: '0.00', balance: '25.00' });
        await expectAccountsMatchReservation(reservation.id);
    });

    it('a conta sem diária aberta antes não vira titular', async () => {
        const room = await newRoom();
        const reservation = await createReservation(app, jwt, guest.id, room.id, nextDates(1)); // 200
        await checkIn(reservation.id);
        const bar = await openAccount({
            type: 'ROOM', reservation_id: reservation.id, room_id: room.id, guest_id: guest.id,
            label: 'Bar aberto antes', charges_lodging: false
        });
        const suite = await openAccount({
            type: 'ROOM', reservation_id: reservation.id, room_id: room.id, guest_id: guest.id, label: 'Suíte depois'
        });
        await payOk({ reservation_id: reservation.id, amount: '50.00' });

        expect((await bill(suite.id)).payments_made).toBe('50.00');
        expect((await bill(bar.id)).payments_made).toBe('0.00');
        await expectAccountsMatchReservation(reservation.id);
    });

    it('com duas contas de diária, a titular é a mais antiga', async () => {
        const first = await newRoom(standard);
        const second = await newRoom(luxo);
        const created = await request(app).post('/reservations').set(auth(jwt)).send({
            guest_id: guest.id, room_id: first.id, extra_room_ids: [second.id], ...nextDates(1)
        });
        expect(created.status).toBe(201);
        const reservation = created.body;
        await checkIn(reservation.id);

        // A conta do quarto extra abre primeiro: a titular é a mais antiga, não a do quarto principal.
        const older = await openAccount({
            type: 'ROOM', reservation_id: reservation.id, room_id: second.id, guest_id: guest.id, label: 'Luxo'
        });
        const newer = await openAccount({
            type: 'ROOM', reservation_id: reservation.id, room_id: first.id, guest_id: guest.id, label: 'Standard'
        });
        await payOk({ reservation_id: reservation.id, amount: '120.00' });

        expect((await bill(older.id)).payments_made).toBe('120.00');
        expect((await bill(newer.id)).payments_made).toBe('0.00');
        await expectAccountsMatchReservation(reservation.id);
    });

    it('check-out com a estadia paga na reserva fecha a conta titular já PAID', async () => {
        const { reservation, account } = await stayWithAccount({ nights: 1 }); // 200
        await addItem(account.id, { description: 'Frigobar', unit_price: '15.00' });
        await payOk({ reservation_id: reservation.id, amount: '215.00' });
        await checkOut(reservation.id);

        expect((await reload(account.id)).status).toBe('PAID');
        await expectAccountsMatchReservation(reservation.id);
    });

    it('check-out com saldo em aberto fecha CLOSED; pagar o resto na conta vira PAID', async () => {
        const { reservation, account } = await stayWithAccount({ nights: 1 }); // 200
        await payOk({ reservation_id: reservation.id, amount: '60.00' }); // sinal
        await checkOut(reservation.id);
        expect((await reload(account.id)).status).toBe('CLOSED');
        await expectAccountsMatchReservation(reservation.id);

        await payOk({ account_id: account.id, amount: '140.00' });
        expect(await bill(account.id)).toMatchObject({ status: 'PAID', payments_made: '200.00', balance: '0.00' });
        await expectAccountsMatchReservation(reservation.id);
    });

    it('pagar contas separadas no check-out: cada uma quita a sua, e a reserva fecha zerada', async () => {
        const { reservation, room, account } = await stayWithAccount({ nights: 1 }); // 200
        const bar = await openAccount({
            type: 'ROOM', reservation_id: reservation.id, room_id: room.id, guest_id: guest.id,
            label: 'Bar separado', charges_lodging: false
        });
        await addItem(bar.id, { description: 'Vinho', unit_price: '80.00' });
        await checkOut(reservation.id);

        await payOk({ account_id: account.id, amount: '200.00' });
        await payOk({ account_id: bar.id, amount: '80.00' });

        expect((await reload(account.id)).status).toBe('PAID');
        expect((await reload(bar.id)).status).toBe('PAID');
        const res = await request(app).get(`/reservations/${reservation.id}/bill`).set(auth(jwt));
        expect(res.body).toMatchObject({ total_paid: 280, balance_due: 0, fully_paid: true });
        await expectAccountsMatchReservation(reservation.id);
    });

    it('alterar o pagamento feito na reserva acerta a titular', async () => {
        const { reservation, account } = await stayWithAccount({ nights: 1 }); // 200
        const payment = await payOk({ reservation_id: reservation.id, amount: '150.00' });
        await checkOut(reservation.id);
        expect((await reload(account.id)).status).toBe('CLOSED');

        await request(app).put(`/payments/${payment.id}`).set(auth(jwt)).send({ amount: '200.00' }).expect(200);
        expect((await reload(account.id)).status).toBe('PAID');
        await expectAccountsMatchReservation(reservation.id);
    });

    it('excluir o pagamento da reserva devolve a titular a CLOSED', async () => {
        const { reservation, account } = await stayWithAccount({ nights: 1 });
        const payment = await payOk({ reservation_id: reservation.id, amount: '200.00' });
        await checkOut(reservation.id);
        expect((await reload(account.id)).status).toBe('PAID');

        await request(app).delete(`/payments/${payment.id}`).set(auth(jwt)).expect(204);
        expect((await reload(account.id)).status).toBe('CLOSED');
    });
});

describe('Concorrência: pagamento da conta × encerramento da estadia (🟡-3)', () => {
    it('pagar a conta junto com o check-out não dá deadlock, e a conta termina acertada', async () => {
        for (let round = 0; round < 5; round += 1) {
            const { reservation, account } = await stayWithAccount({ nights: 1 }); // 200
            const [payment, checkout] = await Promise.all([
                pay({ account_id: account.id, amount: '200.00' }),
                request(app).put(`/reservations/${reservation.id}/check-out`).set(auth(jwt))
            ]);
            expect(payment.status, JSON.stringify(payment.body)).toBe(201);
            expect(checkout.status, JSON.stringify(checkout.body)).toBe(200);
            expect((await reload(account.id)).status).toBe('PAID');
        }
    });

    it('pagar a conta junto com o cancelamento da reserva não dá deadlock', async () => {
        for (let round = 0; round < 5; round += 1) {
            const room = await newRoom();
            const reservation = await createReservation(app, jwt, guest.id, room.id, nextDates(1));
            // Rota antiga: cria a conta da suíte antes do check-in (D-28), e a reserva segue cancelável.
            const legacy = await request(app).post(`/reservations/${reservation.id}/consumptions`).set(auth(jwt))
                .send({ description: 'Água', amount: 5 });
            expect(legacy.status).toBe(201);
            const account = await AccountModel.findOne({ where: { reservation_id: reservation.id } });

            const [payment, cancel] = await Promise.all([
                pay({ account_id: account.id, amount: '5.00' }),
                request(app).put(`/reservations/${reservation.id}/cancel`).set(auth(jwt))
            ]);
            expect(payment.status, JSON.stringify(payment.body)).toBe(201);
            expect(cancel.status, JSON.stringify(cancel.body)).toBe(200);
        }
    });
});

describe('Webhook PIX acerta a conta titular (CA-04.4.d)', () => {
    it('sinal confirmado com a conta ainda aberta: entra no pago, conta segue OPEN', async () => {
        const room = await newRoom();
        const reservation = await createReservation(app, jwt, guest.id, room.id, nextDates(1));
        await request(app).post(`/reservations/${reservation.id}/consumptions`).set(auth(jwt))
            .send({ description: 'Água', amount: 5 }).expect(201);
        const account = await AccountModel.findOne({ where: { reservation_id: reservation.id } });

        const chargeId = `charge_${randomUUID()}`;
        await PaymentModel.create({
            tenant_id: tenantId, reservation_id: reservation.id, amount: '60.00', method: 'PIX',
            status: 'PENDING', kind: 'DEPOSIT', provider: 'fake', provider_charge_id: chargeId, paid_at: null
        });
        const rawBody = JSON.stringify({ provider_charge_id: chargeId });
        const res = await request(app).post('/webhooks/pix').set('Content-Type', 'application/json')
            .set('x-pix-signature', getPixProvider().signNotification(rawBody)).send(rawBody);

        expect(res.body).toMatchObject({ status: 'confirmed', reservation_status: 'CONFIRMED' });
        expect(await bill(account.id)).toMatchObject({ status: 'OPEN', payments_made: '60.00' });
    });

    it('sinal confirmado depois do check-out quita a conta titular', async () => {
        const { reservation, account } = await stayWithAccount({ nights: 1 }); // 200
        await checkOut(reservation.id);
        expect((await reload(account.id)).status).toBe('CLOSED');

        const chargeId = `charge_${randomUUID()}`;
        await PaymentModel.create({
            tenant_id: tenantId, reservation_id: reservation.id, amount: '200.00', method: 'PIX',
            status: 'PENDING', kind: 'DEPOSIT', provider: 'fake', provider_charge_id: chargeId, paid_at: null
        });
        const rawBody = JSON.stringify({ provider_charge_id: chargeId });
        const res = await request(app).post('/webhooks/pix').set('Content-Type', 'application/json')
            .set('x-pix-signature', getPixProvider().signNotification(rawBody)).send(rawBody);

        expect(res.status).toBe(200);
        expect(res.body.status).toBe('confirmed');
        expect((await reload(account.id)).status).toBe('PAID');
    });
});

describe('Pagamento em conta com consumo antigo não migrado (D-31)', () => {
    beforeAll(async () => {
        await sequelize.query('DROP TABLE IF EXISTS consumptions');
        await sequelize.query(`
            CREATE TABLE consumptions (
              id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
              reservation_id UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
              description    TEXT NOT NULL,
              amount         NUMERIC(12, 2) NOT NULL,
              consumed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
              deleted_by     UUID REFERENCES users(id),
              deleted_at     TIMESTAMPTZ,
              created_at     TIMESTAMPTZ DEFAULT now(),
              updated_at     TIMESTAMPTZ DEFAULT now()
            )`);
    });

    afterAll(async () => {
        await sequelize.query('DROP TABLE IF EXISTS consumptions');
    });

    it('503 e nenhum pagamento gravado', async () => {
        const { reservation, account } = await stayWithAccount({ nights: 1 });
        await sequelize.query(
            `INSERT INTO consumptions (tenant_id, reservation_id, description, amount) VALUES (:tenantId, :rid, 'Frigobar', 10)`,
            { replacements: { tenantId, rid: reservation.id } }
        );
        const res = await pay({ account_id: account.id, amount: '10.00' });

        expect(res.status).toBe(503);
        expect(await PaymentModel.count({ where: { account_id: account.id } })).toBe(0);
    });
});

describe('migrate acerta as contas fechadas que já estão pagas', () => {
    it('conta CLOSED quitada por pagamento da reserva vira PAID; idempotente', async () => {
        const { reservation, account } = await stayWithAccount({ nights: 1 });
        await checkOut(reservation.id);
        // Pagamento gravado direto, como um banco anterior à T-04.4: nada acertou a conta.
        await PaymentModel.create({ tenant_id: tenantId, reservation_id: reservation.id, amount: '200.00', method: 'PIX' });
        expect((await reload(account.id)).status).toBe('CLOSED');

        const { default: closeEndedStayAccounts } = await import('../database/closeEndedStayAccounts.js');
        await closeEndedStayAccounts(sequelize);
        expect((await reload(account.id)).status).toBe('PAID');

        await closeEndedStayAccounts(sequelize);
        expect((await reload(account.id)).status).toBe('PAID');
    });

    it('conta PAID cujo pagamento sumiu (pod antigo no rolling update) volta a CLOSED (🟢-1)', async () => {
        const { reservation, account } = await stayWithAccount({ nights: 1 });
        const payment = await payOk({ reservation_id: reservation.id, amount: '200.00' });
        await checkOut(reservation.id);
        expect((await reload(account.id)).status).toBe('PAID');
        // Exclusão sem acerto, como faria o código anterior à T-04.4.
        await PaymentModel.destroy({ where: { id: payment.id } });

        const { default: closeEndedStayAccounts } = await import('../database/closeEndedStayAccounts.js');
        const result = await closeEndedStayAccounts(sequelize);
        expect(result.settled).toBeGreaterThanOrEqual(1);
        expect((await reload(account.id)).status).toBe('CLOSED');
    });
});
