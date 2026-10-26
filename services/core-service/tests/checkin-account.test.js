// T-04.6 (escopo do MVP: CA-04.6.a, c, d) — o check-in cria a conta da suíte.
//
// Decisões (anexo SPEC-04-decisoes-T-04.6.md):
//   D-58 check-in cria 1 conta ROOM no quarto principal, cobrando diária, na mesma
//        transação e depois da trava da reserva; reaproveita a conta de diária existente;
//   D-59 resposta do check-in não muda;
//   D-60 GET /reservations/:id/accounts lista as contas da reserva;
//   D-61 sem conta de diária, o crédito da reserva paga primeiro a diária que ficou na
//        reserva (🟡-1 do qa-redteam da T-04.5).
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import request from 'supertest';
import { createApp } from './helpers/createApp.js';
import { truncateAll } from './helpers/db.js';
import { registerAndLogin } from './helpers/auth.js';
import { createCategory, createRoom, createGuest, createReservation } from './helpers/factories.js';
import AccountModel from '../app/Models/AccountModel.js';
import ReservationModel from '../app/Models/ReservationModel.js';
import RoomModel from '../app/Models/RoomModel.js';
import { toCents } from '../app/utils/calculateStayTotal.js';
import reservationRoomAccount from '../app/utils/reservationRoomAccount.js';
import { checkInWithoutAccount } from './helpers/legacyStay.js';

const app = createApp();
const auth = (token) => ({ Authorization: `Bearer ${token}` });

let jwt, otherJwt, waiterJwt;
let standard, luxo; // 200 e 300 por noite
let guest;
let roomNumber = 1200;

const newRoom = async (category = standard) => {
    roomNumber += 1;
    return createRoom(app, jwt, category.id, { number: String(roomNumber) });
};

let month = 0;
const nextDates = (nights) => {
    month += 1;
    const m = String((month % 12) + 1).padStart(2, '0');
    const year = 2045 + Math.floor(month / 12);
    return { check_in_date: `${year}-${m}-01`, check_out_date: `${year}-${m}-${String(1 + nights).padStart(2, '0')}` };
};

const checkIn = (reservationId) => request(app).put(`/reservations/${reservationId}/check-in`).set(auth(jwt));
const listAccounts = (reservationId, token = jwt) =>
    request(app).get(`/reservations/${reservationId}/accounts`).set(auth(token));

const openAccount = async (body) => {
    const res = await request(app).post('/accounts').set(auth(jwt)).send(body);
    if (res.status !== 201) throw new Error(`abrir conta falhou: ${res.status} ${JSON.stringify(res.body)}`);
    return res.body;
};

const addItem = async (accountId, body) => {
    const res = await request(app).post(`/accounts/${accountId}/items`).set(auth(jwt)).send(body);
    if (res.status !== 201) throw new Error(`lançar item falhou: ${res.status} ${JSON.stringify(res.body)}`);
};

const payOk = async (body) => {
    const res = await request(app).post('/payments').set(auth(jwt)).send({ method: 'DINHEIRO', ...body });
    if (res.status !== 201) throw new Error(`pagamento falhou: ${res.status} ${JSON.stringify(res.body)}`);
};

const get = async (url) => {
    const res = await request(app).get(url).set(auth(jwt));
    if (res.status !== 200) throw new Error(`GET ${url} falhou: ${res.status} ${JSON.stringify(res.body)}`);
    return res.body;
};

const signedCents = (v) => (String(v).startsWith('-') ? -toCents(String(v).slice(1)) : toCents(v));

async function createUserToken(adminJwt, role) {
    const email = `${role.toLowerCase()}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@test.com`;
    const created = await request(app).post('/users').set(auth(adminJwt)).send({ name: role, email, password: 'senha123', role });
    expect(created.status).toBe(201);
    const login = await request(app).post('/auth/login').send({ email, password: 'senha123' });
    return login.body.token;
}

beforeAll(async () => {
    await truncateAll();
    ({ jwt } = await registerAndLogin(app, { tenantName: 'Hotel Check-in Conta' }));
    ({ jwt: otherJwt } = await registerAndLogin(app, { tenantName: 'Hotel Check-in Vizinho' }));
    waiterJwt = await createUserToken(jwt, 'WAITER');
    standard = await createCategory(app, jwt, { name: 'Standard CI', price_per_night: 200 });
    luxo = await createCategory(app, jwt, { name: 'Luxo CI', price_per_night: 300 });
    guest = await createGuest(app, jwt, { full_name: 'Carla Checkin', email: `carla_ci_${Date.now()}@test.com` });
});

afterEach(() => vi.restoreAllMocks());

describe('Check-in cria a conta da suíte (CA-04.6.a, D-58)', () => {
    it('cria 1 conta ROOM, aberta, cobrando diária, com hóspede e rótulo da reserva', async () => {
        const room = await newRoom();
        const reservation = await createReservation(app, jwt, guest.id, room.id, nextDates(2));
        const res = await checkIn(reservation.id);
        expect(res.status).toBe(200);

        const accounts = await AccountModel.findAll({ where: { reservation_id: reservation.id } });
        expect(accounts).toHaveLength(1);
        expect(accounts[0]).toMatchObject({
            type: 'ROOM', status: 'OPEN', charges_lodging: true,
            room_id: room.id, guest_id: guest.id, label: `Suíte ${room.number}`
        });
        // Sem nome do hóspede no rótulo: o garçom lista contas (D-15).
        expect(accounts[0].label).not.toMatch(/Carla/);
    });

    it('a resposta do check-in continua sendo a reserva (D-59)', async () => {
        const room = await newRoom();
        const reservation = await createReservation(app, jwt, guest.id, room.id, nextDates(1));
        const res = await checkIn(reservation.id);
        expect(res.body).toMatchObject({ id: reservation.id, status: 'CHECKED_IN' });
        expect(res.body).not.toHaveProperty('account');
    });

    it('multiquarto: 1 conta no quarto principal, que cobra a diária inteira', async () => {
        const main = await newRoom(luxo);
        const extra = await newRoom(standard);
        const created = await request(app).post('/reservations').set(auth(jwt)).send({
            guest_id: guest.id, room_id: main.id, extra_room_ids: [extra.id], ...nextDates(3)
        });
        expect(created.status).toBe(201);
        expect((await checkIn(created.body.id)).status).toBe(200);

        const accounts = await AccountModel.findAll({ where: { reservation_id: created.body.id } });
        expect(accounts).toHaveLength(1);
        expect(accounts[0].room_id).toBe(main.id);
        const bill = await get(`/accounts/${accounts[0].id}/bill`);
        expect(bill.room_charges).toBe('1500.00');
    });

    it('reaproveita a conta de diária criada antes pela rota antiga de consumo', async () => {
        const room = await newRoom();
        const reservation = await createReservation(app, jwt, guest.id, room.id, nextDates(2));
        const consumption = await request(app).post(`/reservations/${reservation.id}/consumptions`)
            .set(auth(jwt)).send({ description: 'Frigobar', amount: 15 });
        expect(consumption.status).toBe(201);
        const before = await AccountModel.findOne({ where: { reservation_id: reservation.id } });

        expect((await checkIn(reservation.id)).status).toBe(200);
        const accounts = await AccountModel.findAll({ where: { reservation_id: reservation.id } });
        expect(accounts.map((a) => a.id)).toEqual([before.id]);
    });

    it('conta de diária em outro quarto da reserva (dado legado) também é reaproveitada: nunca duas diárias', async () => {
        const main = await newRoom(luxo);
        const extra = await newRoom(standard);
        const created = await request(app).post('/reservations').set(auth(jwt)).send({
            guest_id: guest.id, room_id: main.id, extra_room_ids: [extra.id], ...nextDates(2)
        });
        const legacy = await AccountModel.create({
            tenant_id: created.body.tenant_id, type: 'ROOM', status: 'OPEN', reservation_id: created.body.id,
            room_id: extra.id, guest_id: guest.id, label: 'Extra legado', charges_lodging: true
        });

        expect((await checkIn(created.body.id)).status).toBe(200);
        const lodging = await AccountModel.findAll({ where: { reservation_id: created.body.id, charges_lodging: true } });
        expect(lodging.map((a) => a.id)).toEqual([legacy.id]);
    });

    it('check-in e consumo pela rota antiga em paralelo: uma conta de diária só', async () => {
        const room = await newRoom();
        const reservation = await createReservation(app, jwt, guest.id, room.id, nextDates(2));
        const [ci, consumption] = await Promise.all([
            checkIn(reservation.id),
            request(app).post(`/reservations/${reservation.id}/consumptions`).set(auth(jwt)).send({ description: 'Água', amount: 5 })
        ]);
        expect(ci.status).toBe(200);
        expect(consumption.status).toBe(201);
        const lodging = await AccountModel.findAll({ where: { reservation_id: reservation.id, charges_lodging: true } });
        expect(lodging).toHaveLength(1);
    });

    it('consumo pela rota antiga no meio do check-in: espera a trava e usa a conta dele (🟡-1 do qa-redteam)', async () => {
        const room = await newRoom();
        const reservation = await createReservation(app, jwt, guest.id, room.id, nextDates(1));
        // Pausa o check-in logo depois de ele não achar conta de diária (com a reserva travada)
        // e dispara o consumo nesse instante: é a sequência que dava deadlock (40P01).
        const findOne = AccountModel.findOne.bind(AccountModel);
        let consumption;
        vi.spyOn(AccountModel, 'findOne').mockImplementation(async (options) => {
            const found = await findOne(options);
            if (!consumption && options?.transaction && options?.order && options?.where?.charges_lodging === true) {
                consumption = request(app).post(`/reservations/${reservation.id}/consumptions`)
                    .set(auth(jwt)).send({ description: 'Água', amount: 5 }).then((res) => res);
                await new Promise((resolve) => setTimeout(resolve, 300));
            }
            return found;
        });

        const ci = await checkIn(reservation.id);
        const consumed = await consumption;
        expect(ci.status).toBe(200);
        expect(consumed.status).toBe(201);
        const lodging = await AccountModel.findAll({ where: { reservation_id: reservation.id, charges_lodging: true } });
        expect(lodging).toHaveLength(1);
        expect((await get(`/reservations/${reservation.id}/bill`)).consumptions_total).toBe(5);
    });

    it('estadia encerrada enquanto o consumo esperava a trava: não abre conta (🟢-1 da reauditoria delta)', async () => {
        const room = await newRoom();
        const reservation = await createReservation(app, jwt, guest.id, room.id, nextDates(1));
        await checkInWithoutAccount(app, jwt, reservation.id); // estadia antiga, sem conta de diária
        // O consumo leu a reserva CHECKED_IN; o check-out terminou antes de ele pegar a trava.
        const seenByConsumption = await ReservationModel.findByPk(reservation.id);
        await ReservationModel.update({ status: 'CHECKED_OUT' }, { where: { id: reservation.id } });

        expect(await reservationRoomAccount(seenByConsumption)).toBeNull();
        expect(await AccountModel.count({ where: { reservation_id: reservation.id } })).toBe(0);

        await ReservationModel.update({ status: 'CHECKED_IN' }, { where: { id: reservation.id } });
        await ReservationModel.destroy({ where: { id: reservation.id } }); // excluída no meio-tempo
        expect(await reservationRoomAccount(seenByConsumption)).toBeNull();
        expect(await AccountModel.count({ where: { reservation_id: reservation.id }, paranoid: false })).toBe(0);
    });

    it('colisão no índice da RN-005: o savepoint segura o check-in e a conta que ficou vale', async () => {
        const room = await newRoom();
        const reservation = await createReservation(app, jwt, guest.id, room.id, nextDates(2));
        await request(app).post(`/reservations/${reservation.id}/consumptions`).set(auth(jwt)).send({ description: 'Café', amount: 7 });
        const legacy = await AccountModel.findOne({ where: { reservation_id: reservation.id } });
        // A busca do check-in "não vê" a conta, como na corrida: o INSERT bate no índice.
        vi.spyOn(AccountModel, 'findOne').mockResolvedValueOnce(null);

        const res = await checkIn(reservation.id);
        expect(res.status).toBe(200);
        expect((await ReservationModel.findByPk(reservation.id)).status).toBe('CHECKED_IN');
        const accounts = await AccountModel.findAll({ where: { reservation_id: reservation.id } });
        expect(accounts.map((a) => a.id)).toEqual([legacy.id]);
    });

    it('depois do check-in, abrir outra conta de diária no mesmo quarto → 422 (RN-005)', async () => {
        const room = await newRoom();
        const reservation = await createReservation(app, jwt, guest.id, room.id, nextDates(1));
        await checkIn(reservation.id);
        const res = await request(app).post('/accounts').set(auth(jwt)).send({
            type: 'ROOM', reservation_id: reservation.id, room_id: room.id, guest_id: guest.id, label: 'Outra'
        });
        expect(res.status).toBe(422);
    });

    it('check-in recusado (status inválido) não cria conta', async () => {
        const room = await newRoom();
        const reservation = await createReservation(app, jwt, guest.id, room.id, nextDates(1));
        await request(app).put(`/reservations/${reservation.id}/cancel`).set(auth(jwt));
        expect((await checkIn(reservation.id)).status).toBe(422);
        expect(await AccountModel.count({ where: { reservation_id: reservation.id } })).toBe(0);
    });
});

describe('Estadia de ponta a ponta com a conta do check-in', () => {
    it('check-in → consumo → sinal → check-out: a conta fecha PAID e a reserva fecha zerada', async () => {
        const room = await newRoom();
        const reservation = await createReservation(app, jwt, guest.id, room.id, nextDates(2)); // 400
        await payOk({ reservation_id: reservation.id, amount: 100 }); // sinal antes do check-in
        await checkIn(reservation.id);
        const [account] = (await listAccounts(reservation.id)).body;
        await addItem(account.id, { description: 'Jantar', unit_price: '60.00' });
        await payOk({ account_id: account.id, reservation_id: reservation.id, amount: 360 });

        const checkOut = await request(app).put(`/reservations/${reservation.id}/check-out`).set(auth(jwt));
        expect(checkOut.status).toBe(200);
        const bill = await get(`/accounts/${account.id}/bill`);
        expect(bill).toMatchObject({ status: 'PAID', room_charges: '400.00', total: '460.00', payments_made: '460.00', balance: '0.00' });
        expect((await get(`/reservations/${reservation.id}/bill`)).balance_due).toBe(0);
    });

    it('titular do check-in + acompanhante + sinal pela reserva → check-out: o sinal fica na titular e as somas batem (🟢-2, D-62)', async () => {
        const room = await newRoom();
        const reservation = await createReservation(app, jwt, guest.id, room.id, nextDates(2)); // 400
        await payOk({ reservation_id: reservation.id, amount: 150 });
        await checkIn(reservation.id);
        const [titular] = (await listAccounts(reservation.id)).body;
        // id menor que qualquer UUID sorteado: o check-out trava em ordem de id, e antes da
        // D-62 também fechava nessa ordem — o sinal ia pagar o suco do acompanhante.
        const companion = await AccountModel.create({
            id: '00000000-0000-4000-8000-000000000001', tenant_id: titular.tenant_id, type: 'ROOM', status: 'OPEN',
            reservation_id: reservation.id, room_id: room.id, guest_id: guest.id, label: 'Acompanhante', charges_lodging: false
        });
        await addItem(titular.id, { description: 'Vinho', unit_price: '50.00' });
        await addItem(companion.id, { description: 'Suco', unit_price: '8.00' });

        const checkOut = await request(app).put(`/reservations/${reservation.id}/check-out`).set(auth(jwt));
        expect(checkOut.status).toBe(200);
        const [t, c] = await Promise.all([get(`/accounts/${titular.id}/bill`), get(`/accounts/${companion.id}/bill`)]);
        expect(t).toMatchObject({ status: 'CLOSED', total: '450.00', payments_made: '150.00', balance: '300.00' });
        expect(c).toMatchObject({ status: 'CLOSED', total: '8.00', payments_made: '0.00', balance: '8.00' });
        const resBill = await get(`/reservations/${reservation.id}/bill`);
        expect(resBill.balance_due).toBe(308);
        expect(signedCents(t.balance) + signedCents(c.balance)).toBe(Math.round(resBill.balance_due * 100));
    });
});

describe('Falha na conta desfaz o check-in (CA-04.6.c)', () => {
    it('erro ao criar a conta → 500, reserva e quarto voltam ao que eram', async () => {
        const room = await newRoom();
        const reservation = await createReservation(app, jwt, guest.id, room.id, nextDates(1));
        const statusBefore = (await ReservationModel.findByPk(reservation.id)).status;
        vi.spyOn(AccountModel, 'create').mockRejectedValueOnce(new Error('falha simulada'));
        vi.spyOn(console, 'error').mockImplementation(() => {});

        const res = await checkIn(reservation.id);
        expect(res.status).toBe(500);
        expect((await ReservationModel.findByPk(reservation.id)).status).toBe(statusBefore);
        expect((await RoomModel.findByPk(room.id)).status).toBe('AVAILABLE');
        expect(await AccountModel.count({ where: { reservation_id: reservation.id } })).toBe(0);
    });
});

describe('Falha do banco na conta desfaz o check-in (CA-04.6.c, 🟢-1)', () => {
    it('erro do Postgres dentro do savepoint → 500, e nada do check-in fica gravado', async () => {
        const room = await newRoom();
        const reservation = await createReservation(app, jwt, guest.id, room.id, nextDates(1));
        const statusBefore = (await ReservationModel.findByPk(reservation.id)).status;
        const create = AccountModel.create.bind(AccountModel);
        // INSERT real com um tipo que o banco recusa: o erro nasce no Postgres, não na aplicação.
        // validate: false — sem ele o Sequelize recusaria antes de chegar ao banco.
        vi.spyOn(AccountModel, 'create').mockImplementationOnce((values, options) =>
            create({ ...values, type: 'INVALIDO' }, { ...options, validate: false }));
        const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

        expect((await checkIn(reservation.id)).status).toBe(500);
        expect(logged.mock.calls.flat().some((arg) => arg?.name === 'SequelizeDatabaseError')).toBe(true);
        expect((await ReservationModel.findByPk(reservation.id)).status).toBe(statusBefore);
        expect((await RoomModel.findByPk(room.id)).status).toBe('AVAILABLE');
        expect(await AccountModel.count({ where: { reservation_id: reservation.id } })).toBe(0);
    });
});

describe('GET /reservations/:id/accounts (CA-04.6.d, D-60)', () => {
    it('lista as contas da reserva, da mais antiga para a mais nova', async () => {
        const room = await newRoom();
        const reservation = await createReservation(app, jwt, guest.id, room.id, nextDates(2));
        await checkIn(reservation.id);
        const companion = await openAccount({
            type: 'ROOM', reservation_id: reservation.id, room_id: room.id, guest_id: guest.id,
            label: 'Acompanhante', charges_lodging: false
        });
        // Conta de outra reserva não aparece.
        const otherRoom = await newRoom();
        const other = await createReservation(app, jwt, guest.id, otherRoom.id, nextDates(1));
        await checkIn(other.id);

        const res = await listAccounts(reservation.id);
        expect(res.status).toBe(200);
        expect(res.body.map((a) => a.label)).toEqual([`Suíte ${room.number}`, 'Acompanhante']);
        expect(res.body[1].id).toBe(companion.id);
        expect(res.body[0]).toMatchObject({ type: 'ROOM', status: 'OPEN', charges_lodging: true, reservation_id: reservation.id });
    });

    it('reserva sem conta → lista vazia', async () => {
        const room = await newRoom();
        const reservation = await createReservation(app, jwt, guest.id, room.id, nextDates(1));
        const res = await listAccounts(reservation.id);
        expect(res.status).toBe(200);
        expect(res.body).toEqual([]);
    });

    it('reserva de outro hotel, inexistente ou id inválido → 404', async () => {
        const room = await newRoom();
        const reservation = await createReservation(app, jwt, guest.id, room.id, nextDates(1));
        await checkIn(reservation.id);
        expect((await listAccounts(reservation.id, otherJwt)).status).toBe(404);
        expect((await listAccounts('00000000-0000-4000-8000-000000000000')).status).toBe(404);
        expect((await listAccounts('nao-e-uuid')).status).toBe(404);
    });

    it('garçom → 403 (allowlist)', async () => {
        const room = await newRoom();
        const reservation = await createReservation(app, jwt, guest.id, room.id, nextDates(1));
        expect((await listAccounts(reservation.id, waiterJwt)).status).toBe(403);
    });
});

describe('Crédito da reserva sem conta de diária (D-61, 🟡-1 da T-04.5)', () => {
    /** Estadia antiga: check-in feito, sem conta de diária, só a do acompanhante com um suco de 8. */
    async function legacyStayWithCompanion(deposit) {
        const room = await newRoom();
        const reservation = await createReservation(app, jwt, guest.id, room.id, nextDates(2)); // 400
        await payOk({ reservation_id: reservation.id, amount: deposit });
        await checkIn(reservation.id);
        // Estado de antes da T-04.6: a conta da suíte não existe.
        await AccountModel.destroy({ where: { reservation_id: reservation.id }, force: true });
        const companion = await openAccount({
            type: 'ROOM', reservation_id: reservation.id, room_id: room.id, guest_id: guest.id,
            label: 'Acompanhante', charges_lodging: false
        });
        await addItem(companion.id, { description: 'Suco', unit_price: '8.00' });
        return { reservation, companion };
    }

    it('sinal menor que a diária: a conta do acompanhante não recebe nada e deve o suco', async () => {
        const { reservation, companion } = await legacyStayWithCompanion(150);
        const bill = await get(`/accounts/${companion.id}/bill`);
        expect(bill).toMatchObject({ total: '8.00', payments_made: '0.00', balance: '8.00' });
        const resBill = await get(`/reservations/${reservation.id}/bill`);
        expect(resBill.balance_due).toBe(258);
    });

    it('fechada, a conta do acompanhante fica CLOSED, não PAID', async () => {
        const { companion } = await legacyStayWithCompanion(150);
        const res = await request(app).put(`/accounts/${companion.id}/close`).set(auth(jwt));
        expect(res.status).toBe(200);
        expect((await AccountModel.findByPk(companion.id)).status).toBe('CLOSED');
    });

    it('sinal maior que a diária: só a sobra vai para a conta, e a soma bate com a reserva', async () => {
        const { reservation, companion } = await legacyStayWithCompanion(500);
        const bill = await get(`/accounts/${companion.id}/bill`);
        // 500 − 400 de diária = 100 de crédito: paga o suco (8) e sobra 92 a devolver.
        expect(bill).toMatchObject({ payments_made: '100.00', balance: '-92.00' });
        const resBill = await get(`/reservations/${reservation.id}/bill`);
        expect(resBill.balance_due).toBe(-92);
        expect(signedCents(bill.balance)).toBe(Math.round(resBill.balance_due * 100));
    });

    it('reserva cancelada não reserva diária: o crédito todo segue para as contas', async () => {
        const { reservation, companion } = await legacyStayWithCompanion(150);
        // Cancelar exige PENDING/CONFIRMED: força o estado para isolar a regra (D-46).
        await ReservationModel.update({ status: 'CANCELLED' }, { where: { id: reservation.id } });
        const bill = await get(`/accounts/${companion.id}/bill`);
        expect(bill).toMatchObject({ payments_made: '150.00', balance: '-142.00' });
    });
});

describe('Day-use já atendido (CA-04.6.e e f)', () => {
    it('conta DAY_USE sem reserva tem diária 0 no bill (CA-04.6.f)', async () => {
        const account = await openAccount({ type: 'DAY_USE', guest_id: guest.id, label: 'Piscina — Carla' });
        await addItem(account.id, { description: 'Almoço', unit_price: '45.00' });
        const bill = await get(`/accounts/${account.id}/bill`);
        expect(bill).toMatchObject({ reservation_id: null, room_charges: '0.00', consumptions: '45.00', total: '45.00' });
    });
});
