// T-04.3 — GET /accounts/:id/bill (CA-04.3.a a f).
// Diária por conta = rateio do total da reserva entre os quartos, pelo preço da categoria
// (D-33). payments_made = 0 até a T-04.4 (D-34). Reserva cancelada não cobra diária (D-35).
// Ver docs/specs/anexos/SPEC-04-decisoes-T-04.3.md.
import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import sequelize from '../database/connections/sequelize.js';
import { createApp } from './helpers/createApp.js';
import { truncateAll } from './helpers/db.js';
import { registerAndLogin } from './helpers/auth.js';
import { createCategory, createRoom, createGuest, createReservation } from './helpers/factories.js';
import AccountModel from '../app/Models/AccountModel.js';

const app = createApp();
const auth = (token) => ({ Authorization: `Bearer ${token}` });

let jwt, tenantId, otherJwt, waiterJwt, receptionistJwt;
let standard, luxo; // 200 e 300 por noite
let guest;
let roomNumber = 300;

const newRoom = async (category = standard) => {
    roomNumber += 1;
    return createRoom(app, jwt, category.id, { number: String(roomNumber) });
};

const getBill = (accountId, token = jwt) =>
    request(app).get(`/accounts/${accountId}/bill`).set(auth(token));

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

async function checkIn(reservationId) {
    const res = await request(app).put(`/reservations/${reservationId}/check-in`).set(auth(jwt));
    if (res.status !== 200) throw new Error(`check-in falhou: ${res.status} ${JSON.stringify(res.body)}`);
}

// Datas distintas por reserva: os quartos não colidem no EXCLUDE de ocupação.
let month = 0;
const nextDates = (nights) => {
    month += 1;
    const m = String((month % 12) + 1).padStart(2, '0');
    const year = 2027 + Math.floor(month / 12);
    return { check_in_date: `${year}-${m}-01`, check_out_date: `${year}-${m}-${String(1 + nights).padStart(2, '0')}` };
};

async function createUser(role) {
    const email = `${role.toLowerCase()}_bill_${Date.now()}@test.com`;
    await request(app).post('/users').set(auth(jwt)).send({ name: role, email, password: 'senha123', role });
    const login = await request(app).post('/auth/login').send({ email, password: 'senha123' });
    return login.body.token;
}

beforeAll(async () => {
    await truncateAll();
    ({ jwt, tenantId } = await registerAndLogin(app, { tenantName: 'Hotel Bill da Conta' }));
    ({ jwt: otherJwt } = await registerAndLogin(app, { tenantName: 'Hotel Bill Vizinho' }));
    waiterJwt = await createUser('WAITER');
    receptionistJwt = await createUser('RECEPTIONIST');

    standard = await createCategory(app, jwt, { name: 'Standard Bill', price_per_night: 200 });
    luxo = await createCategory(app, jwt, { name: 'Luxo Bill', price_per_night: 300 });
    guest = await createGuest(app, jwt, { full_name: 'Maria Conta', email: `maria_bill_${Date.now()}@test.com` });
});

describe('GET /accounts/:id/bill — conta da suíte (CA-04.3.a a d)', () => {
    let account, courtesy;

    beforeAll(async () => {
        const room = await newRoom();
        const reservation = await createReservation(app, jwt, guest.id, room.id, nextDates(4)); // 4 × 200
        await checkIn(reservation.id);
        account = await openAccount({
            type: 'ROOM', reservation_id: reservation.id, room_id: room.id, guest_id: guest.id, label: 'Suíte — Maria'
        });
        await addItem(account.id, { description: 'Cerveja', quantity: 2, unit_price: '12.50' });
        courtesy = await addItem(account.id, { description: 'Vinho', unit_price: '30.00', billable: false, reason: 'COURTESY' });

        // Um pagamento da reserva não é da conta antes da T-04.4 (D-34).
        const payment = await request(app).post('/payments').set(auth(jwt))
            .send({ reservation_id: reservation.id, amount: 100, method: 'PIX' });
        if (payment.status !== 201) throw new Error(`pagamento falhou: ${JSON.stringify(payment.body)}`);
    });

    it('CA-04.3.a: devolve diária, consumos, total, pagamentos, saldo e itens', async () => {
        const res = await getBill(account.id);

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({
            account_id: account.id,
            type: 'ROOM',
            status: 'OPEN',
            label: 'Suíte — Maria',
            room_charges: '800.00',
            consumptions: '25.00',
            total: '825.00',
            payments_made: '0.00',
            balance: '825.00'
        });
        expect(res.body.items).toHaveLength(2);
    });

    it('CA-04.3.b: o saldo não é coluna da conta — é calculado a cada leitura', () => {
        const columns = Object.keys(AccountModel.getAttributes());
        expect(columns).not.toContain('balance');
        expect(columns).not.toContain('total');
    });

    it('CA-04.3.c e d: a cortesia fica fora da soma, mas vem na lista com billable e reason', async () => {
        const res = await getBill(account.id);
        const item = res.body.items.find((i) => i.id === courtesy.id);

        expect(item).toMatchObject({ billable: false, reason: 'COURTESY', total: '30.00', description: 'Vinho' });
        expect(res.body.consumptions).toBe('25.00');
    });

    it('item excluído some da lista e da soma', async () => {
        const extra = await addItem(account.id, { description: 'Água', unit_price: '5.00' });
        const del = await request(app).delete(`/accounts/${account.id}/items/${extra.id}`).set(auth(jwt));
        expect(del.status).toBe(204);

        const res = await getBill(account.id);
        expect(res.body.items.map((i) => i.id)).not.toContain(extra.id);
        expect(res.body.consumptions).toBe('25.00');
    });

    it('a resposta não traz dado pessoal do hóspede (D-15)', async () => {
        const res = await getBill(account.id);
        expect(JSON.stringify(res.body)).not.toMatch(/Maria Conta|maria_bill/);
    });
});

describe('Diária rateada entre os quartos da reserva (D-33)', () => {
    it('multiquarto: cada conta leva a parte do seu quarto, e a soma é o total da reserva', async () => {
        const main = await newRoom(luxo);
        const extra = await newRoom(standard);
        const res = await request(app).post('/reservations').set(auth(jwt)).send({
            guest_id: guest.id, room_id: main.id, extra_room_ids: [extra.id], ...nextDates(3)
        });
        expect(res.status).toBe(201);
        expect(res.body.total_amount).toBe('1500.00'); // 3 × (300 + 200)
        await checkIn(res.body.id);

        const a = await openAccount({ type: 'ROOM', guest_id: guest.id, reservation_id: res.body.id, room_id: main.id, label: 'Luxo' });
        const b = await openAccount({ type: 'ROOM', guest_id: guest.id, reservation_id: res.body.id, room_id: extra.id, label: 'Standard' });

        expect((await getBill(a.id)).body.room_charges).toBe('900.00');
        expect((await getBill(b.id)).body.room_charges).toBe('600.00');
    });

    it('B2B: rateia o total do contrato — não o preço × noites — e a sobra do centavo fica no quarto principal', async () => {
        const rooms = [await newRoom(luxo), await newRoom(luxo), await newRoom(luxo)];
        const client = await request(app).post('/corporate-clients').set(auth(jwt)).send({
            razao_social: 'Eventos Bill LTDA', cnpj: '11.222.333/0001-81', email: 'eventos@bill.com',
            representante_nome: 'Rep Bill', representante_cpf: '123.456.789-09', representante_rg: '1.234.567'
        });
        expect(client.status).toBe(201);
        const dates = nextDates(2);
        const contract = await request(app).post('/contracts').set(auth(jwt)).send({
            corporate_client_id: client.body.id, objeto: 'Evento', check_in: dates.check_in_date,
            check_out: dates.check_out_date, pessoas: 6, total: 1000,
            testemunha_1: 'Um', testemunha_2: 'Dois'
        });
        expect(contract.status).toBe(201);
        const signed = await request(app).put(`/contracts/${contract.body.id}/sign`).set(auth(jwt))
            .send({ room_ids: rooms.map((r) => r.id) });
        expect(signed.status).toBe(200);
        const block = signed.body.reservation;

        // A reserva-bloco nasce CONFIRMED: a API só abre conta ROOM depois do check-in.
        const accounts = await Promise.all(rooms.map((room, i) => AccountModel.create({
            tenant_id: tenantId, type: 'ROOM', reservation_id: block.id, guest_id: block.guest_id, room_id: room.id,
            label: `Evento ${i}`, charges_lodging: true
        })));
        const charges = await Promise.all(accounts.map(async (acc) => (await getBill(acc.id)).body.room_charges));

        expect(charges).toEqual(['333.34', '333.33', '333.33']); // rooms[0] é o principal
    });

    it('conta que não cobra diária (acompanhante) → room_charges 0 (CA-04.3.e)', async () => {
        const room = await newRoom();
        const reservation = await createReservation(app, jwt, guest.id, room.id, nextDates(2));
        await checkIn(reservation.id);
        await openAccount({ type: 'ROOM', guest_id: guest.id, reservation_id: reservation.id, room_id: room.id, label: 'Titular' });
        const companion = await openAccount({
            type: 'ROOM', guest_id: guest.id, reservation_id: reservation.id, room_id: room.id, label: 'Acompanhante', charges_lodging: false
        });
        await addItem(companion.id, { description: 'Suco', unit_price: '8.00' });

        const res = await getBill(companion.id);
        expect(res.body).toMatchObject({ room_charges: '0.00', consumptions: '8.00', total: '8.00' });
    });

    it('conta cujo quarto saiu da reserva não cobra diária (D-32)', async () => {
        const oldRoom = await newRoom();
        const newRoomOfStay = await newRoom();
        const reservation = await createReservation(app, jwt, guest.id, oldRoom.id, nextDates(2));
        // Consumo pela rota antiga: cria a conta da suíte no quarto atual (D-28).
        const consumption = await request(app).post(`/reservations/${reservation.id}/consumptions`)
            .set(auth(jwt)).send({ description: 'Frigobar', amount: 15 });
        expect(consumption.status).toBe(201);
        const stale = await AccountModel.findOne({ where: { reservation_id: reservation.id } });

        const swap = await request(app).put(`/reservations/${reservation.id}`).set(auth(jwt))
            .send({ room_id: newRoomOfStay.id });
        expect(swap.status).toBe(200);

        const res = await getBill(stale.id);
        expect(res.body).toMatchObject({ room_charges: '0.00', consumptions: '15.00', total: '15.00' });
    });

    it('reserva cancelada: sem diária, o consumo segue cobrado (D-35)', async () => {
        const room = await newRoom();
        const reservation = await createReservation(app, jwt, guest.id, room.id, nextDates(2));
        await request(app).post(`/reservations/${reservation.id}/consumptions`)
            .set(auth(jwt)).send({ description: 'Café', amount: 40 });
        const cancel = await request(app).put(`/reservations/${reservation.id}/cancel`).set(auth(jwt));
        expect(cancel.status).toBe(200);
        const account = await AccountModel.findOne({ where: { reservation_id: reservation.id } });

        const res = await getBill(account.id);
        expect(res.body).toMatchObject({ room_charges: '0.00', consumptions: '40.00', total: '40.00' });
    });
});

describe('Contas sem hospedagem', () => {
    it('CA-04.3.f: conta INTERNAL tem diária, consumos e total 0, com os itens e seus valores na lista', async () => {
        const internal = await openAccount({ type: 'INTERNAL', label: 'Refeição equipe' });
        await addItem(internal.id, { description: 'Almoço', quantity: 3, unit_price: '20.00' });

        const res = await getBill(internal.id);
        expect(res.body).toMatchObject({ room_charges: '0.00', consumptions: '0.00', total: '0.00', balance: '0.00' });
        expect(res.body.items).toHaveLength(1);
        expect(res.body.items[0].total).toBe('60.00');
    });

    it('conta de mesa: só consumo', async () => {
        const table = await openAccount({ type: 'TABLE', label: 'Mesa 7' });
        await addItem(table.id, { description: 'Porção', unit_price: '45.90' });

        const res = await getBill(table.id);
        expect(res.body).toMatchObject({ room_charges: '0.00', consumptions: '45.90', total: '45.90', balance: '45.90' });
    });
});

describe('Acesso e erros', () => {
    let table;
    beforeAll(async () => { table = await openAccount({ type: 'TABLE', label: 'Mesa acesso' }); });

    it('RECEPTIONIST vê o bill', async () => {
        expect((await getBill(table.id, receptionistJwt)).status).toBe(200);
    });

    it('WAITER não vê o bill (allowlist) → 403', async () => {
        expect((await getBill(table.id, waiterJwt)).status).toBe(403);
    });

    it('conta de outro hotel → 404', async () => {
        expect((await getBill(table.id, otherJwt)).status).toBe(404);
    });

    it('id que não é UUID → 404, nunca 500', async () => {
        expect((await getBill('abc')).status).toBe(404);
    });

    it('conta inexistente → 404', async () => {
        expect((await getBill(randomUUID())).status).toBe(404);
    });
});

describe('Consumo antigo não migrado (D-31)', () => {
    let account, reservation;

    beforeAll(async () => {
        const room = await newRoom();
        reservation = await createReservation(app, jwt, guest.id, room.id, nextDates(2));
        await request(app).post(`/reservations/${reservation.id}/consumptions`)
            .set(auth(jwt)).send({ description: 'Migrado', amount: 10 });
        account = await AccountModel.findOne({ where: { reservation_id: reservation.id } });

        await sequelize.query('DROP TABLE IF EXISTS consumptions');
        await sequelize.query(`
            CREATE TABLE consumptions (
              id UUID PRIMARY KEY, tenant_id UUID NOT NULL, reservation_id UUID NOT NULL,
              description TEXT NOT NULL, amount NUMERIC(12, 2) NOT NULL,
              consumed_at TIMESTAMPTZ NOT NULL DEFAULT now(), deleted_by UUID, deleted_at TIMESTAMPTZ,
              created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
            )`);
        await sequelize.query(
            `INSERT INTO consumptions (id, tenant_id, reservation_id, description, amount)
             VALUES (:id, :tenantId, :reservationId, 'Não migrado', 99)`,
            { replacements: { id: randomUUID(), tenantId, reservationId: reservation.id } }
        );
    });

    afterAll(async () => {
        await sequelize.query('DROP TABLE IF EXISTS consumptions');
    });

    it('o bill da conta responde 503 em vez de um total menor', async () => {
        const res = await getBill(account.id);
        expect(res.status).toBe(503);
    });
});
