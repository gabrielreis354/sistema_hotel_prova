import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import sequelize from '../database/connections/sequelize.js';
import { createApp } from './helpers/createApp.js';
import { truncateAll } from './helpers/db.js';
import { registerAndLogin } from './helpers/auth.js';
import { createCategory, createRoom, createGuest } from './helpers/factories.js';

// Rodada 3, etapa F — reservas com vários quartos e contratos (P-1 a P-4 do catálogo de
// eventos, docs/specs/anexos/SPEC-01-catalogo-eventos.md §11).
//
// P-1 era: um quarto que só existe em reservation_rooms (quarto extra de uma reserva, ou
// quartos 2..N de uma reserva-bloco B2B) ficava invisível para a próxima reserva — o EXCLUDE
// do banco e o checkReservationConflict só olhavam reservations.room_id.

const app = createApp();
let jwt;
let guestId;
let catBarata;   // 100,00
let catCara;     // 150,00
let numero = 500;

const auth = (token = jwt) => ({ Authorization: `Bearer ${token}` });
const novoQuarto = async (cat = catBarata) => (await createRoom(app, jwt, cat.id, { number: String(numero++) })).id;

const reservar = (roomId, extras = [], datas = {}) => request(app).post('/reservations').set(auth()).send({
    guest_id: guestId,
    room_id: roomId,
    extra_room_ids: extras,
    check_in_date: datas.in ?? '2028-01-10',
    check_out_date: datas.out ?? '2028-01-12',
});

async function criarUsuario(role) {
    const email = `${role.toLowerCase()}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@multiquarto.test`;
    const criado = await request(app).post('/users').set(auth()).send({ name: role, email, password: 'senha123', role });
    expect(criado.status).toBe(201);
    return (await request(app).post('/auth/login').send({ email, password: 'senha123' })).body.token;
}

beforeAll(async () => {
    await truncateAll();
    ({ jwt } = await registerAndLogin(app, { tenantName: 'Hotel Multiquarto' }));
    catBarata = await createCategory(app, jwt, { name: 'Standard MQ', price_per_night: 100 });
    catCara = await createCategory(app, jwt, { name: 'Luxo MQ', price_per_night: 150 });
    guestId = (await createGuest(app, jwt)).id;
});

describe('P-1 — quarto extra não é vendido duas vezes (CA-F.1.a)', () => {
    it('recusa (409) reserva cujo quarto EXTRA já é extra de outra reserva no período', async () => {
        const extra = await novoQuarto();
        expect((await reservar(await novoQuarto(), [extra])).status).toBe(201);

        const res = await reservar(await novoQuarto(), [extra]);
        expect(res.status).toBe(409);
    });

    it('recusa (409) reserva cujo quarto PRINCIPAL já é extra de outra reserva no período', async () => {
        const extra = await novoQuarto();
        expect((await reservar(await novoQuarto(), [extra])).status).toBe(201);

        expect((await reservar(extra)).status).toBe(409);
    });

    it('aceita o mesmo quarto extra em período que não se sobrepõe', async () => {
        const extra = await novoQuarto();
        expect((await reservar(await novoQuarto(), [extra])).status).toBe(201);

        const res = await reservar(await novoQuarto(), [extra], { in: '2028-01-12', out: '2028-01-14' });
        expect(res.status).toBe(201);
    });

    it('POST /reservations/:id/rooms recusa (409) quarto já ocupado no período', async () => {
        const ocupado = await novoQuarto();
        expect((await reservar(ocupado)).status).toBe(201);
        const outra = (await reservar(await novoQuarto())).body;

        const res = await request(app).post(`/reservations/${outra.id}/rooms`).set(auth()).send({ room_id: ocupado });
        expect(res.status).toBe(409);
    });

    it('PUT /reservations/:id recusa (409) mudar datas para sobrepor um quarto EXTRA alheio', async () => {
        const extra = await novoQuarto();
        expect((await reservar(await novoQuarto(), [extra], { in: '2028-02-10', out: '2028-02-12' })).status).toBe(201);
        const minha = (await reservar(await novoQuarto(), [extra], { in: '2028-02-12', out: '2028-02-14' })).body;
        expect(minha.id).toBeTruthy();

        const res = await request(app).put(`/reservations/${minha.id}`).set(auth()).send({ check_in_date: '2028-02-11' });
        expect(res.status).toBe(409);
    });

    it('GET /rooms/available não oferece quarto que está ocupado como extra', async () => {
        const extra = await novoQuarto();
        expect((await reservar(await novoQuarto(), [extra], { in: '2028-03-01', out: '2028-03-03' })).status).toBe(201);

        const res = await request(app).get('/rooms/available?check_in=2028-03-02&check_out=2028-03-04').set(auth());
        expect(res.status).toBe(200);
        expect(res.body.map((r) => r.id)).not.toContain(extra);
    });

    it('trocar o quarto principal pelo PUT libera o antigo e ocupa o novo', async () => {
        const antigo = await novoQuarto();
        const novo = await novoQuarto();
        const r = (await reservar(antigo, [], { in: '2028-04-01', out: '2028-04-03' })).body;

        expect((await request(app).put(`/reservations/${r.id}`).set(auth()).send({ room_id: novo })).status).toBe(200);

        expect((await reservar(novo, [], { in: '2028-04-01', out: '2028-04-03' })).status).toBe(409);
        expect((await reservar(antigo, [], { in: '2028-04-01', out: '2028-04-03' })).status).toBe(201);
    });

    it('não deixa remover o quarto principal pela rota de quartos extras (409)', async () => {
        const principal = await novoQuarto();
        const r = (await reservar(principal, [await novoQuarto()], { in: '2028-04-10', out: '2028-04-12' })).body;

        const res = await request(app).delete(`/reservations/${r.id}/rooms/${principal}`).set(auth());
        expect(res.status).toBe(409);
    });
});

describe('P-1 — garantia no banco, não só na aplicação (CA-F.1.b)', () => {
    it('o banco recusa um quarto extra sobreposto inserido direto, contornando a aplicação', async () => {
        const extra = await novoQuarto();
        expect((await reservar(await novoQuarto(), [extra], { in: '2028-05-01', out: '2028-05-05' })).status).toBe(201);
        const outra = (await reservar(await novoQuarto(), [], { in: '2028-05-02', out: '2028-05-04' })).body;

        await expect(sequelize.query(`
            INSERT INTO reservation_rooms (id, reservation_id, room_id, created_at, updated_at)
            VALUES (gen_random_uuid(), '${outra.id}', '${extra}', now(), now())
        `)).rejects.toMatchObject({ name: 'SequelizeExclusionConstraintError' });
    });

    it('o banco recusa estender as datas de uma reserva sobre um quarto extra alheio', async () => {
        const extra = await novoQuarto();
        expect((await reservar(await novoQuarto(), [extra], { in: '2028-05-10', out: '2028-05-12' })).status).toBe(201);
        const minha = (await reservar(await novoQuarto(), [extra], { in: '2028-05-12', out: '2028-05-14' })).body;

        await expect(sequelize.query(
            `UPDATE reservations SET check_in_date = '2028-05-11' WHERE id = '${minha.id}'`
        )).rejects.toMatchObject({ name: 'SequelizeExclusionConstraintError' });
    });
});

describe('P-1 — concorrência (CA-F.1.c)', () => {
    it('duas reservas disputando o mesmo quarto extra em paralelo: uma vence, a outra recebe 409, nunca 500', async () => {
        const extra = await novoQuarto();
        const [a, b] = await Promise.all([
            reservar(await novoQuarto(), [extra], { in: '2028-06-01', out: '2028-06-04' }),
            reservar(await novoQuarto(), [extra], { in: '2028-06-02', out: '2028-06-05' }),
        ]);

        expect([a.status, b.status].sort()).toEqual([201, 409]);
    });
});

describe('P-1 — cancelar libera todos os quartos (CA-F.1.d)', () => {
    it('cancelar uma reserva libera também o quarto extra', async () => {
        const extra = await novoQuarto();
        const r = (await reservar(await novoQuarto(), [extra], { in: '2028-07-01', out: '2028-07-03' })).body;
        expect((await reservar(extra, [], { in: '2028-07-01', out: '2028-07-03' })).status).toBe(409);

        expect((await request(app).put(`/reservations/${r.id}/cancel`).set(auth())).status).toBe(200);

        expect((await reservar(extra, [], { in: '2028-07-01', out: '2028-07-03' })).status).toBe(201);
    });

    it('excluir uma reserva libera também o quarto extra', async () => {
        const extra = await novoQuarto();
        const r = (await reservar(await novoQuarto(), [extra], { in: '2028-07-10', out: '2028-07-12' })).body;

        expect((await request(app).delete(`/reservations/${r.id}`).set(auth())).status).toBe(204);

        expect((await reservar(extra, [], { in: '2028-07-10', out: '2028-07-12' })).status).toBe(201);
    });
});

describe('P-4 — o total soma todos os quartos (CA-F.4)', () => {
    const datas = (i) => ({ in: `2028-08-${String(i).padStart(2, '0')}`, out: `2028-08-${String(i + 2).padStart(2, '0')}` });

    it('dois quartos de categorias diferentes, 2 noites: (100 + 150) × 2 = 500.00', async () => {
        const res = await reservar(await novoQuarto(catBarata), [await novoQuarto(catCara)], datas(1));

        expect(res.status).toBe(201);
        expect(res.body.total_amount).toBe('500.00');
    });

    it('adicionar um quarto recalcula o total', async () => {
        const r = (await reservar(await novoQuarto(catBarata), [], datas(5))).body;
        expect(r.total_amount).toBe('200.00');

        expect((await request(app).post(`/reservations/${r.id}/rooms`).set(auth()).send({ room_id: await novoQuarto(catCara) })).status).toBe(201);

        expect((await request(app).get(`/reservations/${r.id}`).set(auth())).body.total_amount).toBe('500.00');
    });

    it('remover um quarto extra recalcula o total', async () => {
        const extra = await novoQuarto(catCara);
        const r = (await reservar(await novoQuarto(catBarata), [extra], datas(9))).body;

        expect((await request(app).delete(`/reservations/${r.id}/rooms/${extra}`).set(auth())).status).toBe(204);

        expect((await request(app).get(`/reservations/${r.id}`).set(auth())).body.total_amount).toBe('200.00');
    });

    it('mudar as datas recalcula o total pela mesma regra', async () => {
        const r = (await reservar(await novoQuarto(catBarata), [await novoQuarto(catCara)], datas(13))).body;

        const res = await request(app).put(`/reservations/${r.id}`).set(auth()).send({ check_out_date: '2028-08-16' });

        expect(res.status).toBe(200);
        expect((await request(app).get(`/reservations/${r.id}`).set(auth())).body.total_amount).toBe('750.00');
    });

    it('centavos sem erro de ponto flutuante: 3 noites a 33,33 = 99.99', async () => {
        const quebrada = await createCategory(app, jwt, { name: 'Quebrada MQ', price_per_night: 33.33 });
        const res = await reservar(await novoQuarto(quebrada), [], { in: '2028-09-01', out: '2028-09-04' });

        expect(res.body.total_amount).toBe('99.99');
    });
});

describe('Contratos — P-2 e P-3', () => {
    let clientId;

    async function contratoAssinado(roomIds, datas) {
        const c = await request(app).post('/contracts').set(auth()).send({
            corporate_client_id: clientId, objeto: 'Evento MQ', check_in: datas.in, check_out: datas.out,
            pessoas: 4, total: 1000, testemunha_1: 'A', testemunha_2: 'B',
        });
        expect(c.status).toBe(201);
        const s = await request(app).put(`/contracts/${c.body.id}/sign`).set(auth()).send({ room_ids: roomIds });
        return { contrato: c.body, assinatura: s };
    }

    beforeAll(async () => {
        const c = await request(app).post('/corporate-clients').set(auth()).send({
            razao_social: 'Eventos MQ LTDA', representante_nome: 'Fulana MQ', cnpj: '11.222.333/0001-44',
        });
        clientId = c.body.id;
    });

    it('P-1: assinar contrato recusa (409) quarto que já é extra de outra reserva', async () => {
        const extra = await novoQuarto();
        expect((await reservar(await novoQuarto(), [extra], { in: '2028-10-01', out: '2028-10-03' })).status).toBe(201);

        const { assinatura } = await contratoAssinado([await novoQuarto(), extra], { in: '2028-10-01', out: '2028-10-03' });
        expect(assinatura.status).toBe(409);
    });

    it('P-1: os quartos 2..N de uma reserva-bloco ficam ocupados para a recepção', async () => {
        const segundo = await novoQuarto();
        const { assinatura } = await contratoAssinado([await novoQuarto(), segundo], { in: '2028-10-10', out: '2028-10-12' });
        expect(assinatura.status).toBe(200);

        expect((await reservar(segundo, [], { in: '2028-10-10', out: '2028-10-12' })).status).toBe(409);
    });

    it('P-2: cancelar contrato com a reserva-bloco em CHECKED_IN → 409, contrato e reserva intactos (CA-F.2.a)', async () => {
        const { contrato, assinatura } = await contratoAssinado([await novoQuarto()], { in: '2028-11-01', out: '2028-11-03' });
        const reservaId = assinatura.body.reservation.id;
        expect((await request(app).put(`/reservations/${reservaId}/check-in`).set(auth())).status).toBe(200);

        const res = await request(app).put(`/contracts/${contrato.id}/cancel`).set(auth());

        expect(res.status).toBe(409);
        expect((await request(app).get(`/contracts/${contrato.id}`).set(auth())).body.status).toBe('SIGNED');
        expect((await request(app).get(`/reservations/${reservaId}`).set(auth())).body.status).toBe('CHECKED_IN');
    });

    it('P-2: cancelar contrato com a reserva-bloco CONFIRMED cancela os dois e libera os quartos', async () => {
        const quarto = await novoQuarto();
        const { contrato, assinatura } = await contratoAssinado([quarto], { in: '2028-11-10', out: '2028-11-12' });

        expect((await request(app).put(`/contracts/${contrato.id}/cancel`).set(auth())).status).toBe(200);

        expect((await request(app).get(`/reservations/${assinatura.body.reservation.id}`).set(auth())).body.status).toBe('CANCELLED');
        expect((await reservar(quarto, [], { in: '2028-11-10', out: '2028-11-12' })).status).toBe(201);
    });

    it.each(['RECEPTIONIST', 'WAITER'])('P-3: %s recebe 403 ao assinar e ao cancelar contrato (CA-F.3.b)', async (role) => {
        const token = await criarUsuario(role);
        const c = await request(app).post('/contracts').set(auth()).send({
            corporate_client_id: clientId, objeto: 'Evento papel', check_in: '2028-12-01', check_out: '2028-12-03',
            pessoas: 2, total: 500, testemunha_1: 'A', testemunha_2: 'B',
        });

        const assinar = await request(app).put(`/contracts/${c.body.id}/sign`).set(auth(token)).send({ room_ids: [await novoQuarto()] });
        const cancelar = await request(app).put(`/contracts/${c.body.id}/cancel`).set(auth(token));

        expect(assinar.status).toBe(403);
        expect(cancelar.status).toBe(403);
        expect((await request(app).get(`/contracts/${c.body.id}`).set(auth())).body.status).toBe('GENERATED');
    });
});
