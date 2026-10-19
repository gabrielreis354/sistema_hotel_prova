// T-04.1 Bloco C — abrir e consultar contas (comanda) pela API.
// Regras de vínculo por tipo: D-5. Diária só em ROOM: D-4. Papéis: D-8.
// RN-005 por estadia: D-3. Ver docs/specs/anexos/SPEC-04-decisoes-T-04.1.md.
import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import { createApp } from './helpers/createApp.js';
import { truncateAll } from './helpers/db.js';
import { registerAndLogin } from './helpers/auth.js';
import { createCategory, createRoom, createGuest, createReservation } from './helpers/factories.js';
import AccountModel from '../app/Models/AccountModel.js';

const app = createApp();

let jwt;         // ADMIN do hotel A
let waiterJwt;   // WAITER do hotel A
let otherJwt;    // ADMIN do hotel B — prova de isolamento
let tenantId;

let guest;       // titular das reservas
let companion;   // acompanhante: outro hóspede do mesmo hotel
let room101, room102, room103, room104;
let stay;        // reserva CHECKED_IN em 101 + 102 (multiquarto)
let pending;     // reserva PENDING em 103

let otherGuest, otherRoom, otherStay; // do hotel B

const post = (token, body) =>
    request(app).post('/accounts').set('Authorization', `Bearer ${token}`).send(body);

const get = (token, path = '') =>
    request(app).get(`/accounts${path}`).set('Authorization', `Bearer ${token}`);

async function checkIn(token, reservationId) {
    const res = await request(app)
        .put(`/reservations/${reservationId}/check-in`)
        .set('Authorization', `Bearer ${token}`);
    if (res.status !== 200) throw new Error(`check-in falhou: ${res.status} ${JSON.stringify(res.body)}`);
}

beforeAll(async () => {
    await truncateAll();

    ({ jwt, tenantId } = await registerAndLogin(app, { tenantName: 'Hotel Comanda' }));
    ({ jwt: otherJwt } = await registerAndLogin(app, { tenantName: 'Hotel Vizinho Comanda' }));

    const waiterEmail = `garcom_contas_${Date.now()}@test.com`;
    await request(app)
        .post('/users')
        .set('Authorization', `Bearer ${jwt}`)
        .send({ name: 'Garçom', email: waiterEmail, password: 'senha123', role: 'WAITER' });
    const waiterLogin = await request(app).post('/auth/login').send({ email: waiterEmail, password: 'senha123' });
    waiterJwt = waiterLogin.body.token;

    const category = await createCategory(app, jwt);
    room101 = await createRoom(app, jwt, category.id, { number: '101' });
    room102 = await createRoom(app, jwt, category.id, { number: '102' });
    room103 = await createRoom(app, jwt, category.id, { number: '103' });
    room104 = await createRoom(app, jwt, category.id, { number: '104' });
    guest = await createGuest(app, jwt, { full_name: 'João Titular', email: `joao_${Date.now()}@test.com` });
    companion = await createGuest(app, jwt, { full_name: 'Ana Acompanhante', email: `ana_${Date.now()}@test.com` });

    const res = await request(app)
        .post('/reservations')
        .set('Authorization', `Bearer ${jwt}`)
        .send({
            guest_id: guest.id,
            room_id: room101.id,
            extra_room_ids: [room102.id],
            check_in_date: '2027-03-01',
            check_out_date: '2027-03-05'
        });
    if (res.status !== 201) throw new Error(`reserva multiquarto falhou: ${JSON.stringify(res.body)}`);
    stay = res.body;
    await checkIn(jwt, stay.id);

    pending = await createReservation(app, jwt, guest.id, room103.id);

    const otherCategory = await createCategory(app, otherJwt);
    otherRoom = await createRoom(app, otherJwt, otherCategory.id, { number: '101' });
    otherGuest = await createGuest(app, otherJwt, { email: `vizinho_${Date.now()}@test.com` });
    otherStay = await createReservation(app, otherJwt, otherGuest.id, otherRoom.id);
    await checkIn(otherJwt, otherStay.id);
});

const roomAccount = (overrides = {}) => ({
    type: 'ROOM',
    reservation_id: stay.id,
    room_id: room101.id,
    guest_id: guest.id,
    label: 'Suíte 101 — João',
    ...overrides
});

describe('POST /accounts — conta ROOM', () => {
    it('abre a conta da suíte com status OPEN e cobrando a diária', async () => {
        const res = await post(jwt, roomAccount());

        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({
            type: 'ROOM',
            status: 'OPEN',
            reservation_id: stay.id,
            room_id: room101.id,
            guest_id: guest.id,
            label: 'Suíte 101 — João',
            charges_lodging: true,
            tenant_id: tenantId
        });
    });

    it('RN-005: segunda conta cobrando a diária do mesmo quarto na mesma estadia → 422', async () => {
        const res = await post(jwt, roomAccount({ label: 'Suíte 101 — duplicada' }));

        expect(res.status).toBe(422);
        expect(res.body.error).toMatch(/diária/i);
    });

    it('divide a suíte: acompanhante abre conta sem cobrar diária', async () => {
        const res = await post(jwt, roomAccount({
            guest_id: companion.id,
            label: 'Suíte 101 — Ana',
            charges_lodging: false
        }));

        expect(res.status).toBe(201);
        expect(res.body.charges_lodging).toBe(false);
        expect(res.body.guest_id).toBe(companion.id);
    });

    it('aceita o quarto extra da reserva multiquarto (reservation_rooms)', async () => {
        const res = await post(jwt, roomAccount({ room_id: room102.id, label: 'Suíte 102 — João' }));

        expect(res.status).toBe(201);
        expect(res.body.charges_lodging).toBe(true);
    });

    it('RN-005 na corrida: a checagem prévia não vê a outra conta e o índice barra → 422 (nunca 500)', async () => {
        const reservation = await createReservation(app, jwt, guest.id, room104.id, {
            check_in_date: '2027-04-01', check_out_date: '2027-04-03'
        });
        await checkIn(jwt, reservation.id);
        const body = roomAccount({ reservation_id: reservation.id, room_id: room104.id, label: 'Suíte 104' });
        expect((await post(jwt, body)).status).toBe(201);

        // Simula a corrida de forma determinística: a outra requisição gravou depois que
        // esta fez a checagem prévia. Disparar duas em paralelo não garante a intercalação.
        const spy = vi.spyOn(AccountModel, 'findOne').mockResolvedValueOnce(null);
        try {
            const res = await post(jwt, body);
            expect(spy).toHaveBeenCalled();
            expect(res.status).toBe(422);
            expect(res.body.error).toMatch(/RN-005/);
        } finally {
            spy.mockRestore();
        }
    });

    it('ignora o status enviado pelo cliente — toda conta nasce OPEN', async () => {
        const res = await post(jwt, roomAccount({
            guest_id: companion.id, label: 'Tentativa', charges_lodging: false, status: 'PAID'
        }));

        expect(res.status).toBe(201);
        expect(res.body.status).toBe('OPEN');
    });

    it('reserva que ainda não fez check-in → 422', async () => {
        const res = await post(jwt, roomAccount({ reservation_id: pending.id, room_id: room103.id }));

        expect(res.status).toBe(422);
        expect(res.body.error).toMatch(/check-in/i);
    });

    it('quarto que não é da reserva → 422', async () => {
        const res = await post(jwt, roomAccount({ room_id: room103.id, charges_lodging: false }));

        expect(res.status).toBe(422);
        expect(res.body.error).toMatch(/quarto/i);
    });

    it.each(['reservation_id', 'room_id', 'guest_id'])('sem %s → 422', async (campo) => {
        const res = await post(jwt, roomAccount({ [campo]: undefined, charges_lodging: false }));

        expect(res.status).toBe(422);
        expect(res.body.error).toContain(campo);
    });
});

describe('POST /accounts — demais tipos', () => {
    it('TABLE: grava charges_lodging false mesmo sem o campo (D-4)', async () => {
        const res = await post(jwt, { type: 'TABLE', label: 'Mesa 5' });

        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({
            type: 'TABLE', status: 'OPEN', charges_lodging: false,
            reservation_id: null, guest_id: null
        });
    });

    it('CA-04.1.h: INTERNAL aceito sem reserva e sem hóspede', async () => {
        const res = await post(jwt, { type: 'INTERNAL', label: 'Refeição da equipe' });

        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({ type: 'INTERNAL', reservation_id: null, guest_id: null });
    });

    it('DAY_USE com hóspede e quarto opcionais', async () => {
        const res = await post(jwt, {
            type: 'DAY_USE', label: 'Piscina — Ana', guest_id: companion.id, room_id: room104.id
        });

        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({ guest_id: companion.id, room_id: room104.id, charges_lodging: false });
    });

    it('DIRECT sem nenhum vínculo', async () => {
        const res = await post(jwt, { type: 'DIRECT', label: 'Balcão' });

        expect(res.status).toBe(201);
    });

    it.each(['DAY_USE', 'TABLE', 'DIRECT', 'INTERNAL'])('%s com reserva → 422', async (type) => {
        const res = await post(jwt, { type, label: 'X', reservation_id: stay.id });

        expect(res.status).toBe(422);
        expect(res.body.error).toContain('reservation_id');
    });

    it.each(['TABLE', 'INTERNAL'])('%s com hóspede → 422', async (type) => {
        const res = await post(jwt, { type, label: 'X', guest_id: guest.id });

        expect(res.status).toBe(422);
        expect(res.body.error).toContain('guest_id');
    });

    it.each(['DAY_USE', 'TABLE', 'DIRECT', 'INTERNAL'])('%s cobrando diária → 422', async (type) => {
        const res = await post(jwt, { type, label: 'X', charges_lodging: true });

        expect(res.status).toBe(422);
        expect(res.body.error).toContain('charges_lodging');
    });
});

describe('POST /accounts — validação de entrada (400)', () => {
    it('type fora da allowlist', async () => {
        const res = await post(jwt, { type: 'BAR', label: 'X' });
        expect(res.status).toBe(400);
    });

    it('sem type e sem label', async () => {
        const res = await post(jwt, {});
        expect(res.status).toBe(400);
        expect(res.body.errors).toEqual(expect.arrayContaining([
            expect.stringContaining('type'),
            expect.stringContaining('label')
        ]));
    });

    it('label só com espaços', async () => {
        const res = await post(jwt, { type: 'TABLE', label: '   ' });
        expect(res.status).toBe(400);
    });

    it('label acima de 100 caracteres (qa-redteam 19/10)', async () => {
        const res = await post(jwt, { type: 'TABLE', label: 'x'.repeat(101) });
        expect(res.status).toBe(400);
    });

    it('id que não é UUID', async () => {
        const res = await post(jwt, { type: 'DIRECT', label: 'X', guest_id: 'abc' });
        expect(res.status).toBe(400);
    });

    it('charges_lodging que não é booleano', async () => {
        const res = await post(jwt, roomAccount({ charges_lodging: 'sim' }));
        expect(res.status).toBe(400);
    });
});

describe('POST /accounts — isolamento entre hotéis (CA-04.1.m)', () => {
    it('reserva de outro hotel → 404', async () => {
        const res = await post(jwt, roomAccount({ reservation_id: otherStay.id }));
        expect(res.status).toBe(404);
        expect(res.body.error).toMatch(/reserva/i);
    });

    it('quarto de outro hotel → 404', async () => {
        const res = await post(jwt, { type: 'DAY_USE', label: 'X', room_id: otherRoom.id });
        expect(res.status).toBe(404);
        expect(res.body.error).toMatch(/quarto/i);
    });

    it('hóspede de outro hotel → 404', async () => {
        const res = await post(jwt, { type: 'DIRECT', label: 'X', guest_id: otherGuest.id });
        expect(res.status).toBe(404);
        expect(res.body.error).toMatch(/hóspede/i);
    });
});

describe('POST /accounts — papéis (D-8)', () => {
    it.each(['TABLE', 'DIRECT'])('garçom abre conta %s', async (type) => {
        const res = await post(waiterJwt, { type, label: `Garçom ${type}` });
        expect(res.status).toBe(201);
    });

    it.each(['DAY_USE', 'INTERNAL'])('garçom não abre conta %s → 403', async (type) => {
        const res = await post(waiterJwt, { type, label: 'X' });
        expect(res.status).toBe(403);
    });

    it('garçom não abre conta ROOM → 403', async () => {
        const res = await post(waiterJwt, roomAccount({ charges_lodging: false }));
        expect(res.status).toBe(403);
    });
});

describe('GET /accounts', () => {
    it('CA-04.1.f: filtra por status e type', async () => {
        const res = await get(jwt, '?status=OPEN&type=ROOM');

        expect(res.status).toBe(200);
        expect(res.body.length).toBeGreaterThan(0);
        expect(res.body.every(a => a.type === 'ROOM' && a.status === 'OPEN')).toBe(true);
    });

    it('sem filtro devolve todos os tipos do hotel', async () => {
        const res = await get(jwt);

        const tipos = new Set(res.body.map(a => a.type));
        expect(tipos).toEqual(new Set(['ROOM', 'TABLE', 'INTERNAL', 'DAY_USE', 'DIRECT']));
    });

    it.each(['?status=ABERTA', '?type=BAR'])('filtro inválido %s → 400', async (qs) => {
        const res = await get(jwt, qs);
        expect(res.status).toBe(400);
    });

    it('não traz dados pessoais do hóspede nem a reserva — o garçom também lista (LGPD)', async () => {
        const res = await get(waiterJwt);

        expect(res.status).toBe(200);
        for (const account of res.body) {
            expect(account).not.toHaveProperty('guest');
            expect(account).not.toHaveProperty('reservation');
        }
    });

    it('outro hotel não vê as contas deste', async () => {
        const res = await get(otherJwt);

        expect(res.status).toBe(200);
        expect(res.body).toEqual([]);
    });
});

describe('GET /accounts/:id', () => {
    let accountId;

    beforeAll(async () => {
        const res = await post(jwt, { type: 'TABLE', label: 'Mesa 9' });
        accountId = res.body.id;
    });

    it('devolve a conta com a lista de itens', async () => {
        const res = await get(jwt, `/${accountId}`);

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ id: accountId, label: 'Mesa 9', items: [] });
        expect(res.body).not.toHaveProperty('guest');
    });

    it('garçom lê a conta', async () => {
        const res = await get(waiterJwt, `/${accountId}`);
        expect(res.status).toBe(200);
    });

    it('conta de outro hotel → 404', async () => {
        const res = await get(otherJwt, `/${accountId}`);
        expect(res.status).toBe(404);
        expect(res.body.error).toMatch(/conta/i);
    });

    it('id que não é UUID → 404', async () => {
        const res = await get(jwt, '/nao-e-uuid');
        expect(res.status).toBe(404);
        expect(res.body.error).toMatch(/conta/i);
    });
});

describe('accountRuleViolation — recusa do banco vira 422', () => {
    // Import dentro do teste: sem o módulo, só estes casos falham — não o arquivo inteiro.
    const load = async () => (await import('../app/utils/accountRuleViolation.js')).default;
    const fakeResponse = () => {
        const r = { statusCode: null, body: null };
        r.status = (code) => { r.statusCode = code; return r; };
        r.json = (body) => { r.body = body; return r; };
        return r;
    };

    it('traduz um CHECK da comanda em 422 com mensagem da regra', async () => {
        // INSERT direto, contornando o controller: conta TABLE cobrando diária.
        const error = await AccountModel.create({
            tenant_id: tenantId, type: 'TABLE', label: 'Burla', charges_lodging: true
        }).catch(e => e);

        const accountRuleViolation = await load();
        const res = fakeResponse();
        expect(accountRuleViolation(error, res)).toBe(res);
        expect(res.statusCode).toBe(422);
        expect(res.body.error).toMatch(/diária/i);
    });

    it('ignora erros que não são regra da comanda', async () => {
        const accountRuleViolation = await load();
        expect(accountRuleViolation(new Error('qualquer'), fakeResponse())).toBeNull();
    });
});
