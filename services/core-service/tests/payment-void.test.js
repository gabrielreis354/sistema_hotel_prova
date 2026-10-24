// T-06.13 — estorno (VOIDED) no lugar da exclusão de pagamento (CA-06.13.a a i).
//
// Lançamento financeiro não se apaga — se estorna (D-2 do catálogo de eventos, 04/10). O
// pagamento original fica, com motivo, autor e horário; a receita e o saldo das contas
// passam a ignorá-lo. VOIDED ≠ REFUNDED: estorno corrige lançamento feito por engano, sem
// movimento de caixa; devolução ao hóspede (REFUNDED, pelo PSP) é outra tarefa.
import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { QueryTypes } from 'sequelize';
import sequelize from '../database/connections/sequelize.js';
import { createApp } from './helpers/createApp.js';
import { truncateAll } from './helpers/db.js';
import { registerAndLogin } from './helpers/auth.js';
import { createCategory, createRoom, createGuest, createReservation } from './helpers/factories.js';
import AccountModel from '../app/Models/AccountModel.js';
import PaymentModel from '../app/Models/PaymentModel.js';

const app = createApp();
const auth = (token) => ({ Authorization: `Bearer ${token}` });

let jwt, tenantId, adminUserId, receptionistJwt, otherJwt;
let category, guest;
let roomNumber = 900;

let month = 0;
const nextDates = (nights) => {
    month += 1;
    const m = String((month % 12) + 1).padStart(2, '0');
    const year = 2031 + Math.floor(month / 12);
    return { check_in_date: `${year}-${m}-01`, check_out_date: `${year}-${m}-${String(1 + nights).padStart(2, '0')}` };
};

const newReservation = async (token = jwt, cat = category, g = guest, nights = 1) => {
    roomNumber += 1;
    const room = await createRoom(app, token, cat.id, { number: String(roomNumber) });
    const reservation = await createReservation(app, token, g.id, room.id, nextDates(nights));
    return { room, reservation };
};

const pay = async (body, token = jwt) => {
    const res = await request(app).post('/payments').set(auth(token)).send({ method: 'DINHEIRO', ...body });
    if (res.status !== 201) throw new Error(`pagamento falhou: ${res.status} ${JSON.stringify(res.body)}`);
    return res.body;
};

const voidPayment = (id, body, token = jwt) => request(app).post(`/payments/${id}/void`).set(auth(token)).send(body);

const raw = (id) => PaymentModel.unscoped().findByPk(id, { paranoid: false });

async function createUser(role) {
    const email = `${role.toLowerCase()}_void_${Date.now()}@test.com`;
    const created = await request(app).post('/users').set(auth(jwt)).send({ name: role, email, password: 'senha123', role });
    if (created.status !== 201) throw new Error(`usuário falhou: ${created.status} ${JSON.stringify(created.body)}`);
    const login = await request(app).post('/auth/login').send({ email, password: 'senha123' });
    return login.body.token;
}

beforeAll(async () => {
    await truncateAll();
    ({ jwt, tenantId, userId: adminUserId } = await registerAndLogin(app, { tenantName: 'Hotel Estorno' }));
    ({ jwt: otherJwt } = await registerAndLogin(app, { tenantName: 'Hotel Estorno Vizinho' }));
    receptionistJwt = await createUser('RECEPTIONIST');
    category = await createCategory(app, jwt, { name: 'Standard Estorno', price_per_night: 200 });
    guest = await createGuest(app, jwt, { full_name: 'Bruno Estorno', email: `bruno_void_${Date.now()}@test.com` });
});

describe('CA-06.13.a — DELETE /payments/:id deixa de existir', () => {
    it('responde 405 indicando o estorno, e o pagamento continua intacto', async () => {
        const { reservation } = await newReservation();
        const payment = await pay({ reservation_id: reservation.id, amount: '50.00' });

        const res = await request(app).delete(`/payments/${payment.id}`).set(auth(jwt));

        expect(res.status).toBe(405);
        expect(res.headers.allow).toMatch(/GET/);
        expect(res.headers.allow).not.toMatch(/DELETE/);
        expect(res.body.error).toMatch(/void/);
        const row = await raw(payment.id);
        expect(row.deleted_at).toBeNull();
        expect(row.status).toBe('PAID');
    });
});

describe('CA-06.13.b — POST /payments/:id/void', () => {
    it('estorno feliz: grava VOIDED, motivo, autor e horário; o pagamento permanece', async () => {
        const { reservation } = await newReservation();
        const payment = await pay({ reservation_id: reservation.id, amount: '80.00' });

        const res = await voidPayment(payment.id, { reason: '  Valor digitado errado  ' });

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({
            id: payment.id, status: 'VOIDED', void_reason: 'Valor digitado errado', voided_by: adminUserId, amount: '80.00'
        });
        expect(res.body.voided_at).toBeTruthy();
        expect(res.body.pix_qr_code).toBeUndefined();
        expect(res.body.provider_charge_id).toBeUndefined();

        const row = await raw(payment.id);
        expect(row.deleted_at).toBeNull();
        expect(row.status).toBe('VOIDED');
        expect(row.paid_at).not.toBeNull(); // histórico: quando entrou continua registrado

        const get = await request(app).get(`/payments/${payment.id}`).set(auth(jwt));
        expect(get.status).toBe(200);
        expect(get.body).toMatchObject({ status: 'VOIDED', void_reason: 'Valor digitado errado' });
    });

    it('400 sem motivo, com motivo vazio, só de espaços, não-texto ou longo demais; nada muda', async () => {
        const { reservation } = await newReservation();
        const payment = await pay({ reservation_id: reservation.id, amount: '30.00' });

        for (const body of [{}, { reason: '' }, { reason: '   ' }, { reason: 42 }, { reason: ['x'] }, { reason: 'x'.repeat(501) }]) {
            const res = await voidPayment(payment.id, body);
            expect(res.status, JSON.stringify(body).slice(0, 40)).toBe(400);
        }
        const row = await raw(payment.id);
        expect(row.status).toBe('PAID');
        expect(row.void_reason).toBeNull();
    });
});

describe('CA-06.13.c — allowlist: só PAID vira VOIDED', () => {
    it('estornar de novo → 409, e o primeiro motivo fica', async () => {
        const { reservation } = await newReservation();
        const payment = await pay({ reservation_id: reservation.id, amount: '40.00' });
        expect((await voidPayment(payment.id, { reason: 'Duplicado' })).status).toBe(200);

        const res = await voidPayment(payment.id, { reason: 'Outro motivo' });
        expect(res.status).toBe(409);
        expect((await raw(payment.id)).void_reason).toBe('Duplicado');
    });

    it('pagamento de PSP (PIX online) → 409: tirar da receita exige devolução pelo PSP', async () => {
        const { reservation } = await newReservation();
        const psp = await PaymentModel.create({
            tenant_id: tenantId, reservation_id: reservation.id, amount: '60.00', method: 'PIX', status: 'PAID',
            kind: 'DEPOSIT', provider: 'fake', provider_charge_id: `charge_${randomUUID()}`, paid_at: new Date()
        });

        const res = await voidPayment(psp.id, { reason: 'Hóspede pediu' });
        expect(res.status).toBe(409);
        expect((await raw(psp.id)).status).toBe('PAID');
    });

    it.each(['PENDING', 'FAILED', 'EXPIRED'])('pagamento %s → 409', async (status) => {
        const { reservation } = await newReservation();
        const payment = await PaymentModel.create({
            tenant_id: tenantId, reservation_id: reservation.id, amount: '10.00', method: 'DINHEIRO', status, paid_at: null
        });
        const res = await voidPayment(payment.id, { reason: 'Teste' });
        expect(res.status).toBe(409);
        expect((await raw(payment.id)).status).toBe(status);
    });

    it('estorno concorrente do mesmo pagamento: um 200 e um 409, nunca 500', async () => {
        for (let round = 0; round < 5; round += 1) {
            const { reservation } = await newReservation();
            const payment = await pay({ reservation_id: reservation.id, amount: '25.00' });
            const results = await Promise.all([
                voidPayment(payment.id, { reason: 'Corrida A' }),
                voidPayment(payment.id, { reason: 'Corrida B' })
            ]);
            expect(results.map((r) => r.status).sort(), JSON.stringify(results.map((r) => r.body))).toEqual([200, 409]);
            const events = await sequelize.query(
                `SELECT count(*)::int AS n FROM outbox WHERE aggregate_id = :id AND type = 'payment.status_changed'`,
                { replacements: { id: payment.id }, type: QueryTypes.SELECT }
            );
            expect(events[0].n).toBe(1);
        }
    });
});

describe('CA-06.13.d — só ADMIN anula ou altera pagamento', () => {
    let payment;

    beforeAll(async () => {
        const { reservation } = await newReservation();
        payment = await pay({ reservation_id: reservation.id, amount: '90.00' });
    });

    it('RECEPTIONIST → 403 no POST void, no PUT e no DELETE; o pagamento não muda', async () => {
        expect((await voidPayment(payment.id, { reason: 'Sem permissão' }, receptionistJwt)).status).toBe(403);
        expect((await request(app).put(`/payments/${payment.id}`).set(auth(receptionistJwt)).send({ method: 'PIX' })).status).toBe(403);
        expect((await request(app).delete(`/payments/${payment.id}`).set(auth(receptionistJwt))).status).toBe(403);

        const row = await raw(payment.id);
        expect(row).toMatchObject({ status: 'PAID', method: 'DINHEIRO', amount: '90.00' });
        expect(row.deleted_at).toBeNull();
    });

    it('RECEPTIONIST segue registrando e lendo pagamento', async () => {
        const { reservation } = await newReservation();
        const created = await request(app).post('/payments').set(auth(receptionistJwt))
            .send({ reservation_id: reservation.id, amount: '10.00', method: 'DINHEIRO' });
        expect(created.status).toBe(201);
        expect((await request(app).get(`/payments/${payment.id}`).set(auth(receptionistJwt))).status).toBe(200);
    });
});

describe('CA-06.13.h — isolamento de tenant', () => {
    it('pagamento de outro hotel → 404 no void e no PUT, e não muda', async () => {
        const { reservation } = await newReservation();
        const payment = await pay({ reservation_id: reservation.id, amount: '15.00' });

        expect((await voidPayment(payment.id, { reason: 'Invasão' }, otherJwt)).status).toBe(404);
        expect((await request(app).put(`/payments/${payment.id}`).set(auth(otherJwt)).send({ method: 'PIX' })).status).toBe(404);
        expect((await raw(payment.id)).status).toBe('PAID');
    });

    it('id inexistente ou que não é UUID → 404', async () => {
        expect((await voidPayment(randomUUID(), { reason: 'x' })).status).toBe(404);
        expect((await voidPayment('nao-e-uuid', { reason: 'x' })).status).toBe(404);
    });
});

describe('PUT /payments/:id — valor de pagamento PAID não se altera (estorno + novo lançamento)', () => {
    it('mudar o valor → 409 e o valor fica; o mesmo valor com outro método → 200', async () => {
        const { reservation } = await newReservation();
        const payment = await pay({ reservation_id: reservation.id, amount: '70.00' });

        const changed = await request(app).put(`/payments/${payment.id}`).set(auth(jwt)).send({ amount: '50.00' });
        expect(changed.status).toBe(409);
        expect((await raw(payment.id)).amount).toBe('70.00');

        const same = await request(app).put(`/payments/${payment.id}`).set(auth(jwt)).send({ amount: '70.00', method: 'CARTAO_DEBITO' });
        expect(same.status).toBe(200);
        expect(same.body).toMatchObject({ amount: '70.00', method: 'CARTAO_DEBITO' });
        expect(same.body.pix_qr_code).toBeUndefined();
    });

    it('pagamento VOIDED não se altera (409)', async () => {
        const { reservation } = await newReservation();
        const payment = await pay({ reservation_id: reservation.id, amount: '20.00' });
        await voidPayment(payment.id, { reason: 'Errado' }).expect(200);

        const res = await request(app).put(`/payments/${payment.id}`).set(auth(jwt)).send({ method: 'PIX' });
        expect(res.status).toBe(409);
        expect((await raw(payment.id)).method).toBe('DINHEIRO');
    });

    it('pagamento de PSP não se altera pela API (409)', async () => {
        const { reservation } = await newReservation();
        const psp = await PaymentModel.create({
            tenant_id: tenantId, reservation_id: reservation.id, amount: '60.00', method: 'PIX', status: 'PAID',
            kind: 'DEPOSIT', provider: 'fake', provider_charge_id: `charge_${randomUUID()}`, paid_at: new Date()
        });
        const res = await request(app).put(`/payments/${psp.id}`).set(auth(jwt)).send({ method: 'DINHEIRO' });
        expect(res.status).toBe(409);
        expect((await raw(psp.id)).method).toBe('PIX');
    });

    it('não aceita status, motivo nem autor pelo PUT', async () => {
        const { reservation } = await newReservation();
        const payment = await pay({ reservation_id: reservation.id, amount: '20.00' });
        await request(app).put(`/payments/${payment.id}`).set(auth(jwt))
            .send({ status: 'VOIDED', void_reason: 'atalho', voided_by: adminUserId, voided_at: new Date() });

        const row = await raw(payment.id);
        expect(row.status).toBe('PAID');
        expect(row.void_reason).toBeNull();
        expect(row.voided_by).toBeNull();
    });
});

describe('Estorno acerta a conta na mesma transação (T-04.4)', () => {
    const openAccount = async (body) => {
        const res = await request(app).post('/accounts').set(auth(jwt)).send(body);
        if (res.status !== 201) throw new Error(`abrir conta falhou: ${res.status} ${JSON.stringify(res.body)}`);
        return res.body;
    };
    const bill = async (accountId) => (await request(app).get(`/accounts/${accountId}/bill`).set(auth(jwt))).body;
    const reload = (id) => AccountModel.findByPk(id);

    it('conta PAID volta a CLOSED com o saldo; um novo lançamento quita de novo', async () => {
        const account = await openAccount({ type: 'TABLE', label: 'Mesa estorno' });
        await request(app).post(`/accounts/${account.id}/items`).set(auth(jwt))
            .send({ description: 'Jantar', unit_price: '70.00' }).expect(201);
        await request(app).put(`/accounts/${account.id}/close`).set(auth(jwt)).expect(200);
        const payment = await pay({ account_id: account.id, amount: '70.00' });
        expect((await reload(account.id)).status).toBe('PAID');

        await voidPayment(payment.id, { reason: 'Lançado na mesa errada' }).expect(200);
        expect(await bill(account.id)).toMatchObject({ status: 'CLOSED', payments_made: '0.00', balance: '70.00' });

        await pay({ account_id: account.id, amount: '70.00' });
        expect((await reload(account.id)).status).toBe('PAID');
    });

    it('pagamento da reserva que quitava a conta titular: estornar devolve a CLOSED', async () => {
        const { room, reservation } = await newReservation();
        await request(app).put(`/reservations/${reservation.id}/check-in`).set(auth(jwt)).expect(200);
        const account = await openAccount({
            type: 'ROOM', reservation_id: reservation.id, room_id: room.id, guest_id: guest.id, label: 'Suíte estorno'
        });
        const payment = await pay({ reservation_id: reservation.id, amount: '200.00' });
        await request(app).put(`/reservations/${reservation.id}/check-out`).set(auth(jwt)).expect(200);
        expect((await reload(account.id)).status).toBe('PAID');

        await voidPayment(payment.id, { reason: 'Reserva errada' }).expect(200);
        expect((await reload(account.id)).status).toBe('CLOSED');
    });
});

describe('CA-06.13.g — o anulado continua visível, marcado', () => {
    it('aparece na listagem e na conta da reserva com status e motivo; não soma no pago', async () => {
        const { reservation } = await newReservation();
        const kept = await pay({ reservation_id: reservation.id, amount: '120.00' });
        const voided = await pay({ reservation_id: reservation.id, amount: '80.00' });
        await voidPayment(voided.id, { reason: 'Cobrado duas vezes' }).expect(200);

        const list = await request(app).get('/payments').set(auth(jwt));
        const listed = list.body.find((p) => p.id === voided.id);
        expect(listed).toMatchObject({ status: 'VOIDED', void_reason: 'Cobrado duas vezes' });

        const billRes = await request(app).get(`/reservations/${reservation.id}/bill`).set(auth(jwt));
        expect(billRes.status).toBe(200);
        expect(billRes.body.total_paid).toBe(120);
        const ids = billRes.body.payments.map((p) => p.id);
        expect(ids).toEqual(expect.arrayContaining([kept.id, voided.id]));
        expect(billRes.body.payments.find((p) => p.id === voided.id))
            .toMatchObject({ status: 'VOIDED', void_reason: 'Cobrado duas vezes' });
        expect(billRes.body.payments.find((p) => p.id === voided.id).voided_at).toBeTruthy();
    });
});

describe('CA-06.13.f — a receita é a soma dos efetivados', () => {
    let revJwt, revTenantId, revCat, revGuest;

    beforeAll(async () => {
        // Hotel próprio: os totais do analytics são do tenant inteiro.
        ({ jwt: revJwt, tenantId: revTenantId } = await registerAndLogin(app, { tenantName: 'Hotel Receita Estorno' }));
        revCat = await createCategory(app, revJwt, { name: 'Std Receita', price_per_night: 500 });
        revGuest = await createGuest(app, revJwt, { full_name: 'Carla Receita', email: `carla_rev_${Date.now()}@test.com` });
    });

    it('revenue e payment-mix deixam de contar o anulado (e o excluído antigo)', async () => {
        const { reservation } = await newReservation(revJwt, revCat, revGuest);
        await pay({ reservation_id: reservation.id, amount: '300.00' }, revJwt);
        const wrong = await pay({ reservation_id: reservation.id, amount: '100.00', method: 'CARTAO_CREDITO' }, revJwt);
        await voidPayment(wrong.id, { reason: 'Maquininha errada' }, revJwt).expect(200);
        // Exclusão lógica anterior à T-06.13 (D-2): também não é receita.
        const legacy = await PaymentModel.create({
            tenant_id: revTenantId, reservation_id: reservation.id, amount: '50.00', method: 'PIX', paid_at: new Date()
        });
        await legacy.destroy();

        const revenue = await request(app).get('/analytics/revenue').set(auth(revJwt));
        expect(revenue.status).toBe(200);
        expect(revenue.body.realized.total).toBe(300);
        expect(revenue.body.realized.by_month.reduce((acc, m) => acc + m.total, 0)).toBe(300);

        const mix = await request(app).get('/analytics/payment-mix').set(auth(revJwt));
        expect(mix.status).toBe(200);
        expect(mix.body).toEqual([expect.objectContaining({ method: 'DINHEIRO', count: 1, total: 300, pct: 100 })]);
    });

    it('reserva cujo único pagamento foi anulado volta a aparecer como não paga', async () => {
        const { reservation } = await newReservation(revJwt, revCat, revGuest);
        // "Não paga" é reserva ativa (CONFIRMED ou CHECKED_IN) sem pagamento efetivado.
        await sequelize.query(`UPDATE reservations SET status = 'CONFIRMED' WHERE id = :id`, { replacements: { id: reservation.id } });
        const payment = await pay({ reservation_id: reservation.id, amount: '500.00' }, revJwt);

        const before = await request(app).get('/analytics/revenue').set(auth(revJwt));
        expect(before.body.unpaid.map((u) => u.reservation_id)).not.toContain(reservation.id);

        await voidPayment(payment.id, { reason: 'Lançado na reserva errada' }, revJwt).expect(200);
        const after = await request(app).get('/analytics/revenue').set(auth(revJwt));
        expect(after.body.unpaid.map((u) => u.reservation_id)).toContain(reservation.id);
    });
});

describe('CA-06.13.e — banco: VOIDED no CHECK e trilha só no anulado', () => {
    const insert = (over) => sequelize.query(
        `INSERT INTO payments (id, tenant_id, reservation_id, amount, method, status, kind, paid_at, void_reason, voided_by, voided_at, created_at, updated_at)
         VALUES (:id, :tenant_id, :reservation_id, 10, 'DINHEIRO', :status, 'FULL', :paid_at, :void_reason, :voided_by, :voided_at, now(), now())`,
        { replacements: { id: randomUUID(), tenant_id: tenantId, status: 'PAID', paid_at: new Date(), void_reason: null, voided_by: null, voided_at: null, ...over } }
    );
    let reservationId;

    beforeAll(async () => {
        reservationId = (await newReservation()).reservation.id;
    });

    it('aceita VOIDED com a trilha completa', async () => {
        await expect(insert({
            reservation_id: reservationId, status: 'VOIDED', void_reason: 'ok', voided_by: adminUserId, voided_at: new Date()
        })).resolves.toBeDefined();
    });

    it('recusa status fora da allowlist', async () => {
        await expect(insert({ reservation_id: reservationId, status: 'REFUNDED' })).rejects.toThrow(/payments_status_allowlist/);
    });

    it('recusa VOIDED sem motivo, sem autor ou sem horário', async () => {
        const full = { reservation_id: reservationId, status: 'VOIDED', void_reason: 'ok', voided_by: adminUserId, voided_at: new Date() };
        for (const missing of [{ void_reason: null }, { void_reason: '  ' }, { voided_by: null }, { voided_at: null }]) {
            await expect(insert({ ...full, ...missing })).rejects.toThrow(/payments_voided_has_trail/);
        }
    });

    it('recusa trilha de estorno em pagamento não anulado', async () => {
        await expect(insert({ reservation_id: reservationId, void_reason: 'sobrou' })).rejects.toThrow(/payments_trail_only_voided/);
        await expect(insert({ reservation_id: reservationId, voided_by: adminUserId })).rejects.toThrow(/payments_trail_only_voided/);
    });

    it('voided_by é FK de users', async () => {
        await expect(insert({
            reservation_id: reservationId, status: 'VOIDED', void_reason: 'ok', voided_by: randomUUID(), voided_at: new Date()
        })).rejects.toThrow(/foreign key/i);
    });

    it('applyDbConstraints troca o CHECK antigo do schema.sql (sem VOIDED) pela allowlist', async () => {
        const { default: applyDbConstraints } = await import('../database/applyDbConstraints.js');
        // Banco provisionado pelo schema.sql anterior: CHECK de nome automático, sem VOIDED.
        await sequelize.query(`ALTER TABLE payments ADD CONSTRAINT payments_status_check
            CHECK (status IN ('PENDING', 'PAID', 'EXPIRED', 'FAILED')) NOT VALID`);
        await applyDbConstraints(sequelize);

        const [rows] = await sequelize.query(`SELECT conname FROM pg_constraint WHERE conname = 'payments_status_check'`);
        expect(rows).toHaveLength(0);
        const { reservation } = await newReservation();
        const payment = await pay({ reservation_id: reservation.id, amount: '10.00' });
        expect((await voidPayment(payment.id, { reason: 'Depois do migrate' })).status).toBe(200);
    });
});

// ---------------------------------------------------------------------------
// Ressalvas do qa-redteam de 21/10 (docs/qa/redteam_t0613-estorno-pagamento_21out2026.md)
// ---------------------------------------------------------------------------

describe('🟡-1 — PUT não tira da receita um pagamento PAID pela data', () => {
    let pjJwt, pjCat, pjGuest;

    beforeAll(async () => {
        // Hotel próprio: o teste confere o total de receita do tenant.
        ({ jwt: pjJwt } = await registerAndLogin(app, { tenantName: 'Hotel Data do Pagamento' }));
        pjCat = await createCategory(app, pjJwt, { name: 'Std Data', price_per_night: 200 });
        pjGuest = await createGuest(app, pjJwt, { full_name: 'Davi Data', email: `davi_data_${Date.now()}@test.com` });
    });

    it('paid_at nulo, vazio, inválido ou não-texto → 400; a data e a receita não mudam', async () => {
        const { reservation } = await newReservation(pjJwt, pjCat, pjGuest);
        const payment = await pay({ reservation_id: reservation.id, amount: '200.00' }, pjJwt);
        const before = (await raw(payment.id)).paid_at;

        for (const paid_at of [null, '', 'lixo', '2026-13-45', 12345, true, {}]) {
            const res = await request(app).put(`/payments/${payment.id}`).set(auth(pjJwt)).send({ paid_at });
            expect(res.status, `paid_at ${JSON.stringify(paid_at)}`).toBe(400);
        }
        expect((await raw(payment.id)).paid_at).toEqual(before);
        const revenue = await request(app).get('/analytics/revenue').set(auth(pjJwt));
        expect(revenue.body.realized.total).toBe(200);
    });

    it('paid_at válido → 200 e grava a data nova', async () => {
        const { reservation } = await newReservation(pjJwt, pjCat, pjGuest);
        const payment = await pay({ reservation_id: reservation.id, amount: '50.00' }, pjJwt);
        const res = await request(app).put(`/payments/${payment.id}`).set(auth(pjJwt)).send({ paid_at: '2026-10-20T13:00:00.000Z' });
        expect(res.status).toBe(200);
        expect(new Date(res.body.paid_at).toISOString()).toBe('2026-10-20T13:00:00.000Z');
    });

    it('banco: PAID sem paid_at é recusado (payments_paid_has_paid_at); PENDING sem paid_at, não', async () => {
        const { reservation } = await newReservation();
        const insert = (status) => sequelize.query(
            `INSERT INTO payments (id, tenant_id, reservation_id, amount, method, status, kind, paid_at, created_at, updated_at)
             VALUES (:id, :tenantId, :rid, 10, 'PIX', :status, 'FULL', NULL, now(), now())`,
            { replacements: { id: randomUUID(), tenantId, rid: reservation.id, status } }
        );
        await expect(insert('PAID')).rejects.toThrow(/payments_paid_has_paid_at/);
        await expect(insert('PENDING')).resolves.toBeDefined();
        await expect(sequelize.query(`UPDATE payments SET paid_at = NULL WHERE tenant_id = :tenantId AND status = 'PAID'`,
            { replacements: { tenantId } })).rejects.toThrow(/payments_paid_has_paid_at/);
    });

    it('applyDbConstraints cria o CHECK como NOT VALID: linha antiga PAID sem data não trava o migrate', async () => {
        const { default: applyDbConstraints } = await import('../database/applyDbConstraints.js');
        const { reservation } = await newReservation();
        await sequelize.query('ALTER TABLE payments DROP CONSTRAINT payments_paid_has_paid_at');
        await sequelize.query(
            `INSERT INTO payments (id, tenant_id, reservation_id, amount, method, status, kind, paid_at, created_at, updated_at)
             VALUES (:id, :tenantId, :rid, 10, 'PIX', 'PAID', 'FULL', NULL, now(), now())`,
            { replacements: { id: randomUUID(), tenantId, rid: reservation.id } }
        );

        await applyDbConstraints(sequelize);

        const [[constraint]] = await sequelize.query(
            `SELECT convalidated FROM pg_constraint WHERE conname = 'payments_paid_has_paid_at'`
        );
        expect(constraint).toEqual({ convalidated: false });
    });
});

describe('🟢-1 — method em allowlist e paid_at válido, no POST e no PUT', () => {
    it('POST com method fora da lista, nulo ou não-texto → 400; nada é gravado', async () => {
        const { reservation } = await newReservation();
        for (const method of ['BITCOIN', 'CARTAO', 'pix', null, 7]) {
            const res = await request(app).post('/payments').set(auth(jwt))
                .send({ reservation_id: reservation.id, amount: '10.00', method });
            expect(res.status, `method ${JSON.stringify(method)}`).toBe(400);
        }
        expect(await PaymentModel.count({ where: { reservation_id: reservation.id } })).toBe(0);
    });

    it('POST com paid_at inválido → 400 (antes era 500); válido grava a data; ausente usa agora', async () => {
        const { reservation } = await newReservation();
        for (const paid_at of ['lixo', '2026-03-10T99:00', 12345, {}]) {
            const res = await request(app).post('/payments').set(auth(jwt))
                .send({ reservation_id: reservation.id, amount: '10.00', method: 'PIX', paid_at });
            expect(res.status, `paid_at ${JSON.stringify(paid_at)}`).toBe(400);
        }
        const dated = await pay({ reservation_id: reservation.id, amount: '10.00', paid_at: '2026-10-19T10:00:00.000Z' });
        expect(new Date(dated.paid_at).toISOString()).toBe('2026-10-19T10:00:00.000Z');
        const now = await pay({ reservation_id: reservation.id, amount: '10.00' });
        expect(now.paid_at).toBeTruthy();
    });

    it.each(['PIX', 'CARTAO_CREDITO', 'CARTAO_DEBITO', 'DINHEIRO'])('POST e PUT aceitam %s', async (method) => {
        const { reservation } = await newReservation();
        const payment = await pay({ reservation_id: reservation.id, amount: '10.00', method });
        expect(payment.method).toBe(method);
        const res = await request(app).put(`/payments/${payment.id}`).set(auth(jwt)).send({ method });
        expect(res.status).toBe(200);
    });

    it('PUT com method fora da lista, nulo ou não-texto → 400; o método não muda', async () => {
        const { reservation } = await newReservation();
        const payment = await pay({ reservation_id: reservation.id, amount: '10.00' });
        for (const method of ['BITCOIN', null, '', 7]) {
            const res = await request(app).put(`/payments/${payment.id}`).set(auth(jwt)).send({ method });
            expect(res.status, `method ${JSON.stringify(method)}`).toBe(400);
        }
        expect((await raw(payment.id)).method).toBe('DINHEIRO');
    });
});

describe('Reauditoria delta 🟢-1 — data de calendário inexistente e ano < 1 → 400', () => {
    // Hora válida em todos: o que deve barrar é o dia (ou o ano), não a hora.
    const INVALID_DATES = [
        '2026-02-30T10:00:00Z', '2026-02-31', '2026-04-31T12:00:00Z', '2027-02-29T10:00:00Z',
        '2026-00-10T10:00:00Z', '2026-13-01T10:00:00Z', '2026-06-00T10:00:00Z', '0000-01-01', '0000-01-01T10:00:00Z'
    ];

    it('POST recusa e não grava nada', async () => {
        const { reservation } = await newReservation();
        for (const paid_at of INVALID_DATES) {
            const res = await request(app).post('/payments').set(auth(jwt))
                .send({ reservation_id: reservation.id, amount: '10.00', method: 'PIX', paid_at });
            expect(res.status, paid_at).toBe(400);
        }
        expect(await PaymentModel.count({ where: { reservation_id: reservation.id } })).toBe(0);
    });

    it('PUT recusa e a data não muda', async () => {
        const { reservation } = await newReservation();
        const payment = await pay({ reservation_id: reservation.id, amount: '10.00', paid_at: '2026-10-01T10:00:00.000Z' });
        for (const paid_at of INVALID_DATES) {
            const res = await request(app).put(`/payments/${payment.id}`).set(auth(jwt)).send({ paid_at });
            expect(res.status, paid_at).toBe(400);
        }
        expect((await raw(payment.id)).paid_at.toISOString()).toBe('2026-10-01T10:00:00.000Z');
    });

    it('29/02 de ano bissexto e último dia do mês são aceitos, sem mudar de dia', async () => {
        const { reservation } = await newReservation();
        for (const paid_at of ['2028-02-29T10:00:00.000Z', '2026-04-30T12:00:00.000Z', '2026-12-31T10:00:00.000Z']) {
            const created = await pay({ reservation_id: reservation.id, amount: '10.00', paid_at });
            expect(new Date(created.paid_at).toISOString()).toBe(paid_at);
        }
    });
});

describe('Reauditoria delta 🟢-2 — PAID legado sem paid_at no PUT', () => {
    let legacyId;

    beforeAll(async () => {
        const { reservation } = await newReservation();
        legacyId = randomUUID();
        // Linha anterior ao CHECK (NOT VALID não confere o que já existe).
        await sequelize.query('ALTER TABLE payments DROP CONSTRAINT payments_paid_has_paid_at');
        try {
            await sequelize.query(
                `INSERT INTO payments (id, tenant_id, reservation_id, amount, method, status, kind, paid_at, created_at, updated_at)
                 VALUES (:id, :tenantId, :rid, 10, 'DINHEIRO', 'PAID', 'FULL', NULL, now(), now())`,
                { replacements: { id: legacyId, tenantId, rid: reservation.id } }
            );
        } finally {
            await sequelize.query(`ALTER TABLE payments ADD CONSTRAINT payments_paid_has_paid_at
                CHECK (status <> 'PAID' OR paid_at IS NOT NULL) NOT VALID`);
        }
    });

    it('PUT sem paid_at → 422 pedindo a data, nunca 500; nada muda', async () => {
        const res = await request(app).put(`/payments/${legacyId}`).set(auth(jwt)).send({ method: 'PIX' });
        expect(res.status).toBe(422);
        expect(res.body.error).toMatch(/paid_at/);
        expect((await raw(legacyId)).method).toBe('DINHEIRO');
    });

    it('PUT com paid_at corrige a linha', async () => {
        const res = await request(app).put(`/payments/${legacyId}`).set(auth(jwt))
            .send({ method: 'PIX', paid_at: '2026-10-02T09:00:00.000Z' });
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ method: 'PIX' });
        expect((await raw(legacyId)).paid_at.toISOString()).toBe('2026-10-02T09:00:00.000Z');
    });
});

describe('Reauditoria delta 🟢-3 — o model barra PAID sem paid_at antes do banco', () => {
    it('create PAID sem paid_at falha na validação do model, com o nome da regra', async () => {
        const { reservation } = await newReservation();
        const attempt = PaymentModel.create({ tenant_id: tenantId, reservation_id: reservation.id, amount: '10.00', method: 'PIX' });
        await expect(attempt).rejects.toMatchObject({ name: 'SequelizeValidationError' });
        await expect(PaymentModel.create({ tenant_id: tenantId, reservation_id: reservation.id, amount: '10.00', method: 'PIX' }))
            .rejects.toThrow(/paid_at/);
    });

    it('PENDING sem paid_at e PAID com paid_at passam na validação', async () => {
        await expect(PaymentModel.build({ tenant_id: tenantId, amount: '1.00', method: 'PIX', status: 'PENDING' }).validate()).resolves.toBeDefined();
        await expect(PaymentModel.build({ tenant_id: tenantId, amount: '1.00', method: 'PIX', paid_at: new Date() }).validate()).resolves.toBeDefined();
    });
});

describe('🟢-2 — no_show_risk considera só pagamento PAID', () => {
    let nsJwt, nsTenantId, nsCat, nsGuest, today, tomorrow;

    const confirmedToday = async () => {
        roomNumber += 1;
        const room = await createRoom(app, nsJwt, nsCat.id, { number: String(roomNumber) });
        const reservation = await createReservation(app, nsJwt, nsGuest.id, room.id, { check_in_date: today, check_out_date: tomorrow });
        if (!reservation.id) throw new Error(`reserva de hoje falhou: ${JSON.stringify(reservation)}`);
        await sequelize.query(`UPDATE reservations SET status = 'CONFIRMED' WHERE id = :id`, { replacements: { id: reservation.id } });
        return reservation;
    };
    const atRisk = async () => {
        const res = await request(app).get('/analytics/alerts').set(auth(nsJwt));
        expect(res.status).toBe(200);
        return res.body.no_show_risk.map((r) => r.reservation_id);
    };

    beforeAll(async () => {
        ({ jwt: nsJwt, tenantId: nsTenantId } = await registerAndLogin(app, { tenantName: 'Hotel No-show' }));
        nsCat = await createCategory(app, nsJwt, { name: 'Std No-show', price_per_night: 150 });
        nsGuest = await createGuest(app, nsJwt, { full_name: 'Eva Noshow', email: `eva_ns_${Date.now()}@test.com` });
        // A data de hoje do banco, que é a que o alerta compara (CURRENT_DATE).
        const [[dates]] = await sequelize.query(`SELECT CURRENT_DATE::text AS today, (CURRENT_DATE + 1)::text AS tomorrow`);
        ({ today, tomorrow } = dates);
    });

    it('reserva de hoje com pagamento PAID não está em risco; estornado o pagamento, entra', async () => {
        const reservation = await confirmedToday();
        const payment = await pay({ reservation_id: reservation.id, amount: '150.00' }, nsJwt);
        expect(await atRisk()).not.toContain(reservation.id);

        await voidPayment(payment.id, { reason: 'Cartão recusado depois' }, nsJwt).expect(200);
        expect(await atRisk()).toContain(reservation.id);
    });

    it('reserva de hoje só com cobrança PIX PENDING está em risco (D-3)', async () => {
        const reservation = await confirmedToday();
        await PaymentModel.create({
            tenant_id: nsTenantId, reservation_id: reservation.id, amount: '50.00', method: 'PIX', status: 'PENDING',
            kind: 'DEPOSIT', provider: 'fake', provider_charge_id: `charge_${randomUUID()}`, paid_at: null
        });
        expect(await atRisk()).toContain(reservation.id);
    });

    it('reserva de hoje sem pagamento nenhum está em risco', async () => {
        const reservation = await confirmedToday();
        expect(await atRisk()).toContain(reservation.id);
    });
});

describe('🟢-2 — corridas do estorno com outros caminhos que travam a reserva e a conta', () => {
    const openAccount = async (body) => {
        const res = await request(app).post('/accounts').set(auth(jwt)).send(body);
        if (res.status !== 201) throw new Error(`abrir conta falhou: ${res.status} ${JSON.stringify(res.body)}`);
        return res.body;
    };
    const bill = async (accountId) => (await request(app).get(`/accounts/${accountId}/bill`).set(auth(jwt))).body;

    // O resultado final não depende de quem pega a trava primeiro: os testes conferem o estado
    // final, que é o mesmo nas duas ordens — por isso são determinísticos.
    it('estorno ∥ check-out da mesma reserva: sem deadlock, e a conta termina CLOSED com o saldo', async () => {
        for (let round = 0; round < 6; round += 1) {
            const { room, reservation } = await newReservation();
            await request(app).put(`/reservations/${reservation.id}/check-in`).set(auth(jwt)).expect(200);
            const account = await openAccount({
                type: 'ROOM', reservation_id: reservation.id, room_id: room.id, guest_id: guest.id, label: `Suíte corrida ${round}`
            });
            const payment = await pay({ reservation_id: reservation.id, amount: '200.00' });

            const [voided, checkout] = await Promise.all([
                voidPayment(payment.id, { reason: 'Corrida com o check-out' }),
                request(app).put(`/reservations/${reservation.id}/check-out`).set(auth(jwt))
            ]);
            expect(voided.status, JSON.stringify(voided.body)).toBe(200);
            expect(checkout.status, JSON.stringify(checkout.body)).toBe(200);
            expect(await bill(account.id)).toMatchObject({ status: 'CLOSED', payments_made: '0.00', balance: '200.00' });
        }
    });

    it('estorno ∥ novo pagamento na mesma conta: sem deadlock, e o saldo soma só o efetivado', async () => {
        for (let round = 0; round < 6; round += 1) {
            const account = await openAccount({ type: 'TABLE', label: `Mesa corrida ${round}` });
            await request(app).post(`/accounts/${account.id}/items`).set(auth(jwt))
                .send({ description: 'Jantar', unit_price: '70.00' }).expect(201);
            await request(app).put(`/accounts/${account.id}/close`).set(auth(jwt)).expect(200);
            const wrong = await pay({ account_id: account.id, amount: '30.00' });

            const [voided, created] = await Promise.all([
                voidPayment(wrong.id, { reason: 'Corrida com o novo lançamento' }),
                request(app).post('/payments').set(auth(jwt)).send({ account_id: account.id, amount: '40.00', method: 'DINHEIRO' })
            ]);
            expect(voided.status, JSON.stringify(voided.body)).toBe(200);
            expect(created.status, JSON.stringify(created.body)).toBe(201);
            expect(await bill(account.id)).toMatchObject({ status: 'CLOSED', payments_made: '40.00', balance: '30.00' });
        }
    });
});
