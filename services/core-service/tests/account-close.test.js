// T-04.3 — fechamento da conta: PUT /accounts/:id/close (CA-04.3.g), fechamento automático
// quando a estadia encerra (D-36) e o migrate que fecha as contas antigas (D-37).
// Ver docs/specs/anexos/SPEC-04-decisoes-T-04.3.md.
import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import request from 'supertest';
import sequelize from '../database/connections/sequelize.js';
import { createApp } from './helpers/createApp.js';
import { truncateAll } from './helpers/db.js';
import { registerAndLogin } from './helpers/auth.js';
import { createCategory, createRoom, createGuest, createReservation } from './helpers/factories.js';
import AccountModel from '../app/Models/AccountModel.js';
import ReservationModel from '../app/Models/ReservationModel.js';
import AccountItemModel from '../app/Models/AccountItemModel.js';
import { checkInWithoutAccount } from './helpers/legacyStay.js';

// Import tardio: sem o módulo, só os testes do migrate falham — não o arquivo inteiro.
async function closeEndedStayAccounts(db) {
    const { default: run } = await import('../database/closeEndedStayAccounts.js');
    return run(db);
}

const app = createApp();
const auth = (token) => ({ Authorization: `Bearer ${token}` });

let jwt, tenantId, otherJwt, waiterJwt;
let category, guest;
let roomNumber = 500;
let month = 0;

const nextDates = () => {
    month += 1;
    const m = String((month % 12) + 1).padStart(2, '0');
    const year = 2027 + Math.floor(month / 12);
    return { check_in_date: `${year}-${m}-01`, check_out_date: `${year}-${m}-03` };
};

const close = (accountId, token = jwt) =>
    request(app).put(`/accounts/${accountId}/close`).set(auth(token));

const openAccount = async (body) => {
    const res = await request(app).post('/accounts').set(auth(jwt)).send(body);
    if (res.status !== 201) throw new Error(`abrir conta falhou: ${res.status} ${JSON.stringify(res.body)}`);
    return res.body;
};

const addItem = (accountId, body) =>
    request(app).post(`/accounts/${accountId}/items`).set(auth(jwt)).send(body);

const reload = (id) => AccountModel.findByPk(id);

/** Reserva com quarto próprio; checkIn: true faz o check-in pela API. */
async function newStay({ checkIn = false } = {}) {
    roomNumber += 1;
    const room = await createRoom(app, jwt, category.id, { number: String(roomNumber) });
    const reservation = await createReservation(app, jwt, guest.id, room.id, nextDates());
    if (checkIn) {
        const res = await checkInWithoutAccount(app, jwt, reservation.id);
        if (res.status !== 200) throw new Error(`check-in falhou: ${JSON.stringify(res.body)}`);
    }
    return { reservation, room };
}

beforeAll(async () => {
    await truncateAll();
    ({ jwt, tenantId } = await registerAndLogin(app, { tenantName: 'Hotel Fechamento' }));
    ({ jwt: otherJwt } = await registerAndLogin(app, { tenantName: 'Hotel Fechamento Vizinho' }));

    const waiterEmail = `garcom_close_${Date.now()}@test.com`;
    await request(app).post('/users').set(auth(jwt))
        .send({ name: 'Garçom', email: waiterEmail, password: 'senha123', role: 'WAITER' });
    waiterJwt = (await request(app).post('/auth/login').send({ email: waiterEmail, password: 'senha123' })).body.token;

    category = await createCategory(app, jwt, { name: 'Std Fechamento', price_per_night: 150 });
    guest = await createGuest(app, jwt, { email: `fecha_${Date.now()}@test.com` });
});

afterEach(() => vi.restoreAllMocks());

describe('PUT /accounts/:id/close (CA-04.3.g)', () => {
    it('OPEN → CLOSED, grava closed_at e devolve o bill', async () => {
        const table = await openAccount({ type: 'TABLE', label: 'Mesa 1' });
        await addItem(table.id, { description: 'Refrigerante', unit_price: '7.00' });

        const res = await close(table.id);

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ account_id: table.id, status: 'CLOSED', total: '7.00', balance: '7.00' });
        const saved = await reload(table.id);
        expect(saved.status).toBe('CLOSED');
        expect(saved.closed_at).toBeInstanceOf(Date);
    });

    it('conta fechada não aceita item novo', async () => {
        const table = await openAccount({ type: 'TABLE', label: 'Mesa 2' });
        await close(table.id);

        const res = await addItem(table.id, { description: 'Atrasado', unit_price: '3.00' });
        expect(res.status).toBe(422);
    });

    it('conta que cobra diária não fecha com a estadia em andamento → 422 (N-1 da reauditoria)', async () => {
        const { reservation, room } = await newStay({ checkIn: true });
        const account = await openAccount({ type: 'ROOM', guest_id: guest.id, reservation_id: reservation.id, room_id: room.id, label: 'Suíte' });

        const res = await close(account.id);

        expect(res.status).toBe(422);
        expect(res.body.error).toMatch(/check-out|diária/i);
        expect((await reload(account.id)).status).toBe('OPEN');
    });

    it('nem antes do check-in → 422', async () => {
        const { reservation } = await newStay();
        await request(app).post(`/reservations/${reservation.id}/consumptions`).set(auth(jwt)).send({ description: 'Café', amount: 5 });
        const account = await AccountModel.findOne({ where: { reservation_id: reservation.id } });

        expect((await close(account.id)).status).toBe(422);
    });

    it('conta da suíte sem diária fecha com o hóspede hospedado (acertar o bar antes de sair)', async () => {
        const { reservation, room } = await newStay({ checkIn: true });
        const bar = await openAccount({
            type: 'ROOM', guest_id: guest.id, reservation_id: reservation.id, room_id: room.id, label: 'Bar', charges_lodging: false
        });
        await addItem(bar.id, { description: 'Drink', unit_price: '22.00' });

        const res = await close(bar.id);
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ room_charges: '0.00', total: '22.00' });
    });

    it('conta de diária que sobrou aberta numa estadia encerrada fecha, com o resto do total', async () => {
        const { reservation, room } = await newStay({ checkIn: true });
        const account = await openAccount({ type: 'ROOM', guest_id: guest.id, reservation_id: reservation.id, room_id: room.id, label: 'Sobrou' });
        await request(app).put(`/reservations/${reservation.id}/check-out`).set(auth(jwt));
        // Como a corrida da D-36: a conta ficou aberta depois do encerramento.
        await AccountModel.update({ status: 'OPEN', closed_at: null, closed_room_charges: null }, { where: { id: account.id } });

        const res = await close(account.id);
        expect(res.status).toBe(200);
        expect(res.body.room_charges).toBe('300.00'); // 2 × 150
    });

    it.each([
        ['cancelada', (id) => request(app).put(`/reservations/${id}/cancel`).set(auth(jwt))],
        ['excluída', (id) => request(app).delete(`/reservations/${id}`).set(auth(jwt))]
    ])('conta de diária que sobrou aberta em reserva %s fecha, com diária 0 (N-5)', async (_, end) => {
        const { reservation } = await newStay();
        await request(app).post(`/reservations/${reservation.id}/consumptions`).set(auth(jwt)).send({ description: 'Café', amount: 4 });
        const account = await AccountModel.findOne({ where: { reservation_id: reservation.id } });
        expect((await end(reservation.id)).status).toBeLessThan(300);
        // Sobra da corrida da D-36: a conta ficou aberta depois do encerramento.
        await AccountModel.update({ status: 'OPEN', closed_at: null, closed_room_charges: null }, { where: { id: account.id } });

        const res = await close(account.id);
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ room_charges: '0.00', total: '4.00' });
    });

    it('closeAccount recusa conta que não está aberta (N-4)', async () => {
        const { closeAccount } = await import('../app/utils/accountBill.js');
        const table = await openAccount({ type: 'TABLE', label: 'Mesa N-4' });
        await close(table.id);
        const closedAt = (await reload(table.id)).closed_at.toISOString();

        const locked = await reload(table.id);
        await expect(sequelize.transaction((t) => closeAccount(locked, t))).rejects.toThrow(/aberta/);
        expect((await reload(table.id)).closed_at.toISOString()).toBe(closedAt);
    });

    it.each(['CLOSED', 'PAID'])('conta %s → 422, sem mudar o closed_at', async (status) => {
        const table = await openAccount({ type: 'TABLE', label: `Mesa ${status}` });
        const closedAt = new Date('2026-10-01T10:00:00Z');
        await AccountModel.update({ status, closed_at: closedAt }, { where: { id: table.id } });

        const res = await close(table.id);

        expect(res.status).toBe(422);
        const saved = await reload(table.id);
        expect(saved.status).toBe(status);
        expect(saved.closed_at.toISOString()).toBe(closedAt.toISOString());
    });

    it('WAITER não fecha conta (allowlist) → 403', async () => {
        const table = await openAccount({ type: 'TABLE', label: 'Mesa garçom' });
        expect((await close(table.id, waiterJwt)).status).toBe(403);
        expect((await reload(table.id)).status).toBe('OPEN');
    });

    it('conta de outro hotel → 404, e ela continua aberta', async () => {
        const table = await openAccount({ type: 'TABLE', label: 'Mesa vizinho' });
        expect((await close(table.id, otherJwt)).status).toBe(404);
        expect((await reload(table.id)).status).toBe('OPEN');
    });

    it('id que não é UUID → 404; inexistente → 404', async () => {
        expect((await close('abc')).status).toBe(404);
        expect((await close(randomUUID())).status).toBe(404);
    });

    it('fechamentos simultâneos de contas da suíte não esgotam o pool de conexões (🟡-2 do qa-redteam)', async () => {
        const accounts = [];
        for (let i = 0; i < 6; i += 1) {
            const { reservation, room } = await newStay({ checkIn: true });
            // Sem diária: fecha durante a estadia e passa pela checagem do consumo não migrado.
            accounts.push(await openAccount({ type: 'ROOM', guest_id: guest.id, reservation_id: reservation.id, room_id: room.id, label: `Pool ${i}`, charges_lodging: false }));
        }
        const started = Date.now();
        const results = await Promise.all(accounts.map((a) => close(a.id)));

        expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200, 200, 200]);
        expect(Date.now() - started).toBeLessThan(10_000);
    });

    it('o realinhamento da troca de quarto não move conta fechada (🟡-1 do qa-redteam)', async () => {
        const { reservation, room } = await newStay({ checkIn: true });
        const account = await openAccount({ type: 'ROOM', guest_id: guest.id, reservation_id: reservation.id, room_id: room.id, label: 'Fechada antes' });
        // Conta de diária fechada com a estadia em andamento não sai mais pela API (N-1); o
        // estado vem de antes dessa regra, e o realinhamento não pode mexer nele.
        await AccountModel.update({ status: 'CLOSED', closed_at: new Date(), closed_room_charges: '300.00' }, { where: { id: account.id } });
        roomNumber += 1;
        const other = await createRoom(app, jwt, category.id, { number: String(roomNumber) });
        const swap = await request(app).put(`/reservations/${reservation.id}`).set(auth(jwt)).send({ room_id: other.id });
        expect(swap.status).toBe(200);

        await request(app).post('/accounts').set(auth(jwt)).send({
            type: 'ROOM', guest_id: guest.id, reservation_id: reservation.id, room_id: other.id, label: 'Quarto novo'
        });

        expect((await reload(account.id)).room_id).toBe(room.id);
    });

    it('dois fechamentos simultâneos: exatamente um 200', async () => {
        for (let round = 0; round < 8; round += 1) {
            const table = await openAccount({ type: 'TABLE', label: `Mesa corrida ${round}` });
            const results = await Promise.all([close(table.id), close(table.id), close(table.id)]);
            expect(results.map((r) => r.status).sort()).toEqual([200, 422, 422]);
        }
    });

    it('lançamento e fechamento simultâneos: o bill fechado tem todo item aceito', async () => {
        for (let round = 0; round < 8; round += 1) {
            const table = await openAccount({ type: 'TABLE', label: `Mesa lança ${round}` });
            const [item, closed] = await Promise.all([
                addItem(table.id, { description: 'Corrida', unit_price: '10.00' }),
                close(table.id)
            ]);
            expect(closed.status).toBe(200);
            expect([201, 422]).toContain(item.status);

            const bill = await request(app).get(`/accounts/${table.id}/bill`).set(auth(jwt));
            expect(bill.body.total).toBe(item.status === 201 ? '10.00' : '0.00');
            // O que o fechamento devolveu é o que ficou: nenhum item entra depois do CLOSED.
            expect(closed.body.total).toBe(bill.body.total);
        }
    });
});

describe('Encerrar a estadia fecha as contas abertas dela (D-36)', () => {
    it('check-out fecha a conta da suíte e a do acompanhante; contas de fora seguem abertas', async () => {
        const { reservation, room } = await newStay({ checkIn: true });
        const main = await openAccount({ type: 'ROOM', guest_id: guest.id, reservation_id: reservation.id, room_id: room.id, label: 'Titular' });
        const companion = await openAccount({
            type: 'ROOM', guest_id: guest.id, reservation_id: reservation.id, room_id: room.id, label: 'Acompanhante', charges_lodging: false
        });
        const table = await openAccount({ type: 'TABLE', label: 'Mesa de fora' });
        const other = await newStay({ checkIn: true });
        const otherAccount = await openAccount({
            type: 'ROOM', guest_id: guest.id, reservation_id: other.reservation.id, room_id: other.room.id, label: 'Outra estadia'
        });

        const res = await request(app).put(`/reservations/${reservation.id}/check-out`).set(auth(jwt));
        expect(res.status).toBe(200);

        for (const id of [main.id, companion.id]) {
            const saved = await reload(id);
            expect(saved.status).toBe('CLOSED');
            expect(saved.closed_at).toBeInstanceOf(Date);
        }
        expect((await reload(table.id)).status).toBe('OPEN');
        expect((await reload(otherAccount.id)).status).toBe('OPEN');
    });

    it('check-out não reescreve o closed_at de uma conta já fechada', async () => {
        const { reservation, room } = await newStay({ checkIn: true });
        const account = await openAccount({
            type: 'ROOM', guest_id: guest.id, reservation_id: reservation.id, room_id: room.id, label: 'Já fechada', charges_lodging: false
        });
        await close(account.id);
        const closedAt = (await reload(account.id)).closed_at.toISOString();

        const out = await request(app).put(`/reservations/${reservation.id}/check-out`).set(auth(jwt));
        expect(out.status).toBe(200);
        expect((await reload(account.id)).closed_at.toISOString()).toBe(closedAt);
    });

    it('cancelamento fecha a conta aberta pela rota antiga de consumo', async () => {
        const { reservation } = await newStay();
        const consumption = await request(app).post(`/reservations/${reservation.id}/consumptions`)
            .set(auth(jwt)).send({ description: 'Café', amount: 12 });
        expect(consumption.status).toBe(201);

        const res = await request(app).put(`/reservations/${reservation.id}/cancel`).set(auth(jwt));
        expect(res.status).toBe(200);

        const account = await AccountModel.findOne({ where: { reservation_id: reservation.id } });
        expect(account.status).toBe('CLOSED');
    });

    it('excluir a reserva fecha as contas dela', async () => {
        const { reservation } = await newStay();
        await request(app).post(`/reservations/${reservation.id}/consumptions`)
            .set(auth(jwt)).send({ description: 'Água', amount: 5 });

        const res = await request(app).delete(`/reservations/${reservation.id}`).set(auth(jwt));
        expect(res.status).toBe(204);

        const account = await AccountModel.findOne({ where: { reservation_id: reservation.id } });
        expect(account.status).toBe('CLOSED');
    });

    it('cancelar o contrato fecha as contas da reserva-bloco', async () => {
        roomNumber += 1;
        const room = await createRoom(app, jwt, category.id, { number: String(roomNumber) });
        const client = await request(app).post('/corporate-clients').set(auth(jwt)).send({
            razao_social: 'Fecha Eventos LTDA', cnpj: '22.333.444/0001-55', email: 'fecha@eventos.com',
            representante_nome: 'Rep Fecha', representante_cpf: '987.654.321-00', representante_rg: '7.654.321'
        });
        const dates = nextDates();
        const contract = await request(app).post('/contracts').set(auth(jwt)).send({
            corporate_client_id: client.body.id, objeto: 'Evento', check_in: dates.check_in_date,
            check_out: dates.check_out_date, pessoas: 2, total: 500, testemunha_1: 'Um', testemunha_2: 'Dois'
        });
        const signed = await request(app).put(`/contracts/${contract.body.id}/sign`).set(auth(jwt))
            .send({ room_ids: [room.id] });
        expect(signed.status).toBe(200);
        const account = await AccountModel.create({
            tenant_id: tenantId, type: 'ROOM', reservation_id: signed.body.reservation.id,
            guest_id: signed.body.reservation.guest_id,
            room_id: room.id, label: 'Evento', charges_lodging: true
        });

        const res = await request(app).put(`/contracts/${contract.body.id}/cancel`).set(auth(jwt));
        expect(res.status).toBe(200);
        expect((await reload(account.id)).status).toBe('CLOSED');
    });

    it('rota antiga: estadia encerrada entre a primeira leitura e a trava da conta → 422 (🟢-1 do qa-redteam)', async () => {
        const { reservation } = await newStay({ checkIn: true });
        const out = await request(app).put(`/reservations/${reservation.id}/check-out`).set(auth(jwt));
        expect(out.status).toBe(200);
        // A primeira leitura vê a estadia como era antes do check-out, como numa corrida.
        const before = await ReservationModel.findByPk(reservation.id);
        vi.spyOn(ReservationModel, 'findOne').mockResolvedValueOnce(
            ReservationModel.build({ ...before.get({ plain: true }), status: 'CHECKED_IN' }, { isNewRecord: false })
        );

        const res = await request(app).post(`/reservations/${reservation.id}/consumptions`)
            .set(auth(jwt)).send({ description: 'Atrasado', amount: 9 });

        expect(res.status).toBe(422);
        expect(await AccountItemModel.count({ where: { description: 'Atrasado' } })).toBe(0);
    });

    it('fechamento manual e check-out simultâneos: a conta fecha uma vez só', async () => {
        for (let round = 0; round < 8; round += 1) {
            const { reservation, room } = await newStay({ checkIn: true });
            const account = await openAccount({
                type: 'ROOM', guest_id: guest.id, reservation_id: reservation.id, room_id: room.id, label: `Corrida ${round}`, charges_lodging: false
            });
            const [manual, out] = await Promise.all([
                close(account.id),
                request(app).put(`/reservations/${reservation.id}/check-out`).set(auth(jwt))
            ]);
            expect(out.status).toBe(200);
            const saved = await reload(account.id);
            // Se o fechamento manual venceu, o check-out não regrava a conta por cima dele.
            if (manual.status === 200) expect(saved.closed_at.toISOString()).toBe(new Date(manual.body.closed_at).toISOString());
            expect(saved.status).toBe('CLOSED');
        }
    });

    it('se fechar as contas falha, o check-out inteiro volta atrás', async () => {
        const { reservation, room } = await newStay({ checkIn: true });
        const account = await openAccount({ type: 'ROOM', guest_id: guest.id, reservation_id: reservation.id, room_id: room.id, label: 'Rollback' });
        vi.spyOn(AccountModel, 'update').mockRejectedValueOnce(new Error('falha simulada'));

        const res = await request(app).put(`/reservations/${reservation.id}/check-out`).set(auth(jwt));

        expect(res.status).toBe(500);
        expect((await ReservationModel.findByPk(reservation.id)).status).toBe('CHECKED_IN');
        expect((await reload(account.id)).status).toBe('OPEN');
    });
});

describe('Diária gravada no fechamento (D-39)', () => {
    const bill = (id) => request(app).get(`/accounts/${id}/bill`).set(auth(jwt));

    /** Reserva Luxo (principal) + Standard, 2 noites, com check-in e uma conta por quarto. */
    async function twoRoomStay() {
        const lux = await createCategory(app, jwt, { name: `Lux ${randomUUID()}`, price_per_night: 300 });
        const std = await createCategory(app, jwt, { name: `Std ${randomUUID()}`, price_per_night: 200 });
        roomNumber += 1; const main = await createRoom(app, jwt, lux.id, { number: String(roomNumber) });
        roomNumber += 1; const extra = await createRoom(app, jwt, std.id, { number: String(roomNumber) });
        const res = await request(app).post('/reservations').set(auth(jwt)).send({
            guest_id: guest.id, room_id: main.id, extra_room_ids: [extra.id], ...nextDates()
        });
        expect(res.body.total_amount).toBe('1000.00'); // 2 × (300 + 200)
        await checkInWithoutAccount(app, jwt, res.body.id);
        const a = await openAccount({ type: 'ROOM', guest_id: guest.id, reservation_id: res.body.id, room_id: main.id, label: 'Lux' });
        const b = await openAccount({ type: 'ROOM', guest_id: guest.id, reservation_id: res.body.id, room_id: extra.id, label: 'Std' });
        return { reservation: res.body, std, a, b };
    }

    // Uma conta de diária fechada e outra aberta na mesma estadia: só acontece numa sobra da
    // corrida da D-36 ou antes da regra do N-1. Gravado direto, para testar o rateio do resto.
    const closeDirect = (id, charges) =>
        AccountModel.update({ status: 'CLOSED', closed_at: new Date(), closed_room_charges: charges }, { where: { id } });

    it('o fechamento grava a diária apresentada', async () => {
        const { reservation, a, b } = await twoRoomStay();
        await request(app).put(`/reservations/${reservation.id}/check-out`).set(auth(jwt));
        await AccountModel.update({ status: 'OPEN', closed_at: null, closed_room_charges: null }, { where: { id: a.id } });

        const closed = await close(a.id);

        expect(closed.body.room_charges).toBe('600.00'); // 1000 − os 400 já gravados em b
        expect((await reload(a.id)).closed_room_charges).toBe('600.00');
        expect((await reload(b.id)).closed_room_charges).toBe('400.00');
    });

    it('preço e total mudam depois do check-out: as contas fechadas não mudam', async () => {
        const { reservation, std, a, b } = await twoRoomStay();
        await request(app).put(`/reservations/${reservation.id}/check-out`).set(auth(jwt));
        const update = await request(app).put(`/room-categories/${std.id}`).set(auth(jwt)).send({ price_per_night: 900 });
        expect(update.status).toBe(200);
        // Sem o valor gravado, o rateio na hora daria outra coisa (N-6 da 3ª rodada).
        await ReservationModel.update({ total_amount: '1250.00' }, { where: { id: reservation.id } });

        expect((await bill(a.id)).body.room_charges).toBe('600.00');
        expect((await bill(b.id)).body.room_charges).toBe('400.00');
    });

    it('preço muda com uma fechada e outra aberta: a aberta leva o resto do total, nunca mais', async () => {
        const { std, a, b } = await twoRoomStay();
        await closeDirect(a.id, '600.00');
        await request(app).put(`/room-categories/${std.id}`).set(auth(jwt)).send({ price_per_night: 900 });

        expect((await bill(b.id)).body.room_charges).toBe('400.00');
    });

    it('total da reserva muda depois: a aberta absorve a diferença', async () => {
        const { reservation, a, b } = await twoRoomStay();
        await closeDirect(a.id, '600.00');
        await ReservationModel.update({ total_amount: '1250.00' }, { where: { id: reservation.id } });

        expect((await bill(a.id)).body.room_charges).toBe('600.00');
        expect((await bill(b.id)).body.room_charges).toBe('650.00');
    });

    it('total da reserva cai abaixo do que já foi fechado: a aberta fica com 0, nunca negativo', async () => {
        const { reservation, a, b } = await twoRoomStay();
        await closeDirect(a.id, '600.00');
        await ReservationModel.update({ total_amount: '500.00' }, { where: { id: reservation.id } });

        expect((await bill(b.id)).body.room_charges).toBe('0.00');
    });

    it('o check-out grava a diária das contas que fecha, e a soma é o total', async () => {
        const { reservation, a, b } = await twoRoomStay();
        await request(app).put(`/reservations/${reservation.id}/check-out`).set(auth(jwt));

        const charges = [(await reload(a.id)).closed_room_charges, (await reload(b.id)).closed_room_charges];
        expect(charges).toEqual(['600.00', '400.00']);
    });

    it('excluir a reserva depois do check-out não muda a diária gravada (D-35 ajustada, N-6)', async () => {
        const { reservation, a, b } = await twoRoomStay();
        await request(app).put(`/reservations/${reservation.id}/check-out`).set(auth(jwt));

        const del = await request(app).delete(`/reservations/${reservation.id}`).set(auth(jwt));
        expect(del.status).toBe(204);

        expect((await bill(a.id)).body.room_charges).toBe('600.00');
        expect((await bill(b.id)).body.room_charges).toBe('400.00');
    });

    it('o cancelamento grava diária 0', async () => {
        const { reservation } = await newStay();
        await request(app).post(`/reservations/${reservation.id}/consumptions`)
            .set(auth(jwt)).send({ description: 'Café', amount: 3 });
        await request(app).put(`/reservations/${reservation.id}/cancel`).set(auth(jwt));

        const account = await AccountModel.findOne({ where: { reservation_id: reservation.id } });
        expect(account.closed_room_charges).toBe('0.00');
    });

    it('conta aberta não tem diária gravada (CHECK no banco)', async () => {
        const table = await openAccount({ type: 'TABLE', label: 'Mesa CHECK' });
        const error = await sequelize.query(
            `UPDATE accounts SET closed_room_charges = 10 WHERE id = :id`, { replacements: { id: table.id } }
        ).then(() => null, (e) => e);
        expect(error?.parent?.constraint).toBe('accounts_closed_room_charges_only_closed');
    });

    it('migrate grava a diária das contas fechadas sem ela, sem passar do total; idempotente', async () => {
        const { reservation, a, b } = await twoRoomStay();
        await request(app).put(`/reservations/${reservation.id}/check-out`).set(auth(jwt));
        // Como as contas fechadas antes da T-04.3 (migração da T-04.2, D-30): sem diária gravada.
        await AccountModel.update({ closed_room_charges: null }, { where: { id: [a.id, b.id] } });

        const first = await closeEndedStayAccounts(sequelize);
        expect(first.recorded).toBeGreaterThanOrEqual(2);
        const charges = [(await reload(a.id)).closed_room_charges, (await reload(b.id)).closed_room_charges];
        expect(charges).toEqual(['600.00', '400.00']);

        await expect(closeEndedStayAccounts(sequelize)).resolves.toMatchObject({ closed: 0, recorded: 0 });
    });
});

describe('migrate fecha as contas abertas de estadias já encerradas (D-37)', () => {
    it('fecha as de check-out, cancelamento e reserva excluída; mantém as vivas; é idempotente', async () => {
        const reopen = (id) => AccountModel.update({ status: 'OPEN', closed_at: null, closed_room_charges: null }, { where: { id } });

        // Contas que ficaram abertas antes da T-04.3: o encerramento aconteceu, e ninguém fechou.
        const checkedOut = await newStay({ checkIn: true });
        const a = await openAccount({
            type: 'ROOM', guest_id: guest.id, reservation_id: checkedOut.reservation.id, room_id: checkedOut.room.id, label: 'Saiu'
        });
        await request(app).put(`/reservations/${checkedOut.reservation.id}/check-out`).set(auth(jwt));
        await reopen(a.id);

        const cancelled = await newStay();
        await request(app).post(`/reservations/${cancelled.reservation.id}/consumptions`)
            .set(auth(jwt)).send({ description: 'Café', amount: 1 });
        await request(app).put(`/reservations/${cancelled.reservation.id}/cancel`).set(auth(jwt));
        const b = await AccountModel.findOne({ where: { reservation_id: cancelled.reservation.id } });
        await reopen(b.id);

        const deleted = await newStay();
        await request(app).post(`/reservations/${deleted.reservation.id}/consumptions`)
            .set(auth(jwt)).send({ description: 'Água', amount: 1 });
        const c = await AccountModel.findOne({ where: { reservation_id: deleted.reservation.id } });
        await ReservationModel.destroy({ where: { id: deleted.reservation.id } }); // soft delete, sem o controller
        await reopen(c.id);

        const living = await newStay({ checkIn: true });
        const alive = await openAccount({
            type: 'ROOM', guest_id: guest.id, reservation_id: living.reservation.id, room_id: living.room.id, label: 'Hospedado'
        });
        const table = await openAccount({ type: 'TABLE', label: 'Mesa viva' });

        const first = await closeEndedStayAccounts(sequelize);
        expect(first).toMatchObject({ closed: 3 });

        for (const id of [a.id, b.id, c.id]) {
            const saved = await reload(id);
            expect(saved.status).toBe('CLOSED');
            expect(saved.closed_at).toBeInstanceOf(Date);
        }
        expect((await reload(alive.id)).status).toBe('OPEN');
        expect((await reload(table.id)).status).toBe('OPEN');

        await expect(closeEndedStayAccounts(sequelize)).resolves.toMatchObject({ closed: 0, recorded: 0 });
    });
});
