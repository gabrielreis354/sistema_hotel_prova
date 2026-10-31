import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import sequelize from '../database/connections/sequelize.js';
import { createApp } from './helpers/createApp.js';
import { truncateAll } from './helpers/db.js';
import { registerAndLogin } from './helpers/auth.js';
import { createCategory, createRoom, createGuest, createReservation } from './helpers/factories.js';
import PaymentModel from '../app/Models/PaymentModel.js';
import { pipelineConfigured, startPipeline, analyticsGet, waitForConsumption } from './helpers/analyticsPipeline.js';

// Indicadores contra o analytics-service (T-01.4/H.3, CA-01.4.p): o core semeia (pela API e, onde o
// caminho é histórico, pelo banco), o outbox publica no RabbitMQ, o analytics consome e responde.
// Antes de cada leitura o teste espera o analytics consumir tudo o que o core gravou.
//
// Asserções alteradas em relação à versão que rodava contra o core, cada uma com a decisão:
//   - dinheiro chega como string decimal ("300.00"), não número — catálogo §9.1, "Dinheiro nas
//     consultas sobre a projeção" (NUMERIC até a resposta, sem ::float)
//   - alerts sem guest_phone, com guest_id — D-1
//   - "em aberto" é saldo > 0: a reserva com sinal parcial CONTINUA na lista — D-3 refinada
// Os demais casos (7 endpoints 200, KPIs, 401, RT-51, sem e-mail, isolamento, estorno fora da
// receita, no-show só com PAID) têm a mesma asserção de antes, agora lida do analytics.

const app = createApp();
const auth = (token) => ({ Authorization: `Bearer ${token}` });
const describePipeline = pipelineConfigured ? describe : describe.skip;
if (!pipelineConfigured) {
    console.warn('⚠️  analytics.test.js: pipeline PULADO — sem RABBITMQ_HOST/RABBITMQ_*_PASSWORD no .env.test (ver .env.test.example).');
}

const ENDPOINTS = [
    '/analytics/revenue',
    '/analytics/occupancy',
    '/analytics/alerts',
    '/analytics/seasonality',
    '/analytics/revenue-by-category',
    '/analytics/payment-mix',
    '/analytics/top-guests',
];

let pipeline;
let jwt;
let roomNumber = 700;

async function pay(token, body) {
    const res = await request(app).post('/payments').set(auth(token)).send({ method: 'DINHEIRO', ...body });
    if (res.status !== 201) throw new Error(`pagamento falhou: ${res.status} ${JSON.stringify(res.body)}`);
    return res.body;
}

const voidPayment = (token, id, reason) =>
    request(app).post(`/payments/${id}/void`).set(auth(token)).send({ reason }).expect(200);

const confirm = (id) =>
    sequelize.query(`UPDATE reservations SET status = 'CONFIRMED' WHERE id = :id`, { replacements: { id } });

async function newHotel(name, price) {
    const hotel = await registerAndLogin(app, { tenantName: name });
    hotel.cat = await createCategory(app, hotel.jwt, { name: `Std ${name}`, price_per_night: price });
    hotel.guest = await createGuest(app, hotel.jwt, { full_name: `Hóspede ${name}`, email: `h_${randomUUID()}@test.com`, phone: '(11) 98888-7777' });
    return hotel;
}

async function newReservation(hotel, dates) {
    roomNumber += 1;
    const room = await createRoom(app, hotel.jwt, hotel.cat.id, { number: String(roomNumber) });
    const reservation = await createReservation(app, hotel.jwt, hotel.guest.id, room.id, dates);
    if (!reservation.id) throw new Error(`reserva falhou: ${JSON.stringify(reservation)}`);
    return reservation;
}

/** Espera o consumo e lê do analytics. */
async function read(path, token) {
    await waitForConsumption();
    return analyticsGet(path, token);
}

describePipeline('Indicadores servidos pelo analytics-service (CA-01.4.p)', () => {
    beforeAll(async () => {
        await truncateAll();
        pipeline = await startPipeline();

        ({ jwt } = await registerAndLogin(app, { tenantName: 'Hotel Analytics' }));
        const cat   = await createCategory(app, jwt, { price_per_night: 250 });
        const room  = await createRoom(app, jwt, cat.id, { number: '401' });
        const guest = await createGuest(app, jwt);
        const reservation = await createReservation(app, jwt, guest.id, room.id, {
            check_in_date: '2027-04-01', check_out_date: '2027-04-04',
        });
        await request(app).post('/payments').set(auth(jwt))
            .send({ reservation_id: reservation.id, amount: 750, method: 'PIX' });
        await waitForConsumption();
    }, 90000);

    afterAll(async () => {
        await pipeline?.stop();
    });

    describe('os 7 endpoints respondem 200 com dados', () => {
        for (const ep of ENDPOINTS) {
            it(`GET ${ep} → 200 (JSON)`, async () => {
                const res = await analyticsGet(ep, jwt);
                expect(res.status).toBe(200);
                expect(res.body).toBeTruthy();
            });
        }
    });

    describe('KPIs específicos', () => {
        it('occupancy retorna ADR, RevPAR e taxa de ocupação', async () => {
            const res = await analyticsGet('/analytics/occupancy', jwt);
            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('occupancy_rate');
            expect(res.body).toHaveProperty('adr');
            expect(res.body).toHaveProperty('revpar');
            expect(res.body.total_rooms).toBeGreaterThanOrEqual(1);
            // Acrescentada (catálogo §9.1): ADR e RevPAR são dinheiro → string decimal, não float.
            expect(res.body.adr).toMatch(/^\d+\.\d{2}$/);
            expect(res.body.revpar).toMatch(/^\d+\.\d{2}$/);
        });

        it('payment-mix reflete o pagamento PIX registrado', async () => {
            const res = await analyticsGet('/analytics/payment-mix', jwt);
            expect(res.status).toBe(200);
            const body = JSON.stringify(res.body);
            expect(body).toContain('PIX');
        });
    });

    describe('segurança', () => {
        it('sem token retorna 401', async () => {
            const res = await analyticsGet('/analytics/revenue');
            expect(res.status).toBe(401);
        });

        // RT-51: o ranking é dado pessoal (nome do hóspede com o valor gasto). Só o gerente
        // vê; a recepção continua com os outros indicadores.
        describe('top-guests é só do ADMIN (RT-51)', () => {
            let receptionistJwt;

            beforeAll(async () => {
                const email = `recepcao_${Date.now()}@test.com`;
                await request(app).post('/users').set(auth(jwt))
                    .send({ name: 'Recepção', email, password: 'senha123', role: 'RECEPTIONIST' });
                const login = await request(app).post('/auth/login').send({ email, password: 'senha123' });
                receptionistJwt = login.body.token;
            });

            it('403 para a recepção', async () => {
                const res = await analyticsGet('/analytics/top-guests', receptionistJwt);
                expect(res.status).toBe(403);
            });

            it('a recepção continua vendo os outros indicadores', async () => {
                const res = await analyticsGet('/analytics/occupancy', receptionistJwt);
                expect(res.status).toBe(200);
            });
        });

        // Minimização (LGPD art. 6º, III): a tela do ranking não mostra o e-mail, então ele não
        // trafega. Quem precisar do contato abre a ficha do hóspede.
        it('top-guests não devolve o e-mail do hóspede', async () => {
            const res = await analyticsGet('/analytics/top-guests', jwt);
            expect(res.status).toBe(200);
            expect(res.body.length).toBeGreaterThan(0);
            for (const row of res.body) expect(row).not.toHaveProperty('email');
        });

        it('top-guests de outro hotel não traz os hóspedes deste', async () => {
            const { jwt: otherJwt } = await registerAndLogin(app, { tenantName: 'Hotel Vizinho' });
            // O hotel novo só existe no analytics depois do tenant.created consumido (antes: 401).
            const res = await read('/analytics/top-guests', otherJwt);
            expect(res.status).toBe(200);
            expect(res.body).toEqual([]);
        });
    });

    // Trazido de payment-void.test.js (CA-06.13.f): a receita é a soma dos efetivados.
    describe('estorno fora da receita (T-06.13, D-2)', () => {
        let hotel;

        beforeAll(async () => {
            hotel = await newHotel('Receita Estorno', 500);
        });

        it('revenue e payment-mix deixam de contar o anulado (e o excluído antigo)', async () => {
            const reservation = await newReservation(hotel, { check_in_date: '2031-02-01', check_out_date: '2031-02-02' });
            await pay(hotel.jwt, { reservation_id: reservation.id, amount: '300.00' });
            const wrong = await pay(hotel.jwt, { reservation_id: reservation.id, amount: '100.00', method: 'CARTAO_CREDITO' });
            await voidPayment(hotel.jwt, wrong.id, 'Maquininha errada');
            // Exclusão lógica anterior à T-06.13 (D-2): também não é receita.
            const legacy = await PaymentModel.create({
                tenant_id: hotel.tenantId, reservation_id: reservation.id, amount: '50.00', method: 'PIX', paid_at: new Date()
            });
            await legacy.destroy();

            const revenue = await read('/analytics/revenue', hotel.jwt);
            expect(revenue.status).toBe(200);
            // Alterada (catálogo §9.1): 300 → "300.00"; a soma dos meses vira o mês único em string.
            expect(revenue.body.realized.total).toBe('300.00');
            expect(revenue.body.realized.by_month).toEqual([expect.objectContaining({ total: '300.00' })]);

            const mix = await analyticsGet('/analytics/payment-mix', hotel.jwt);
            expect(mix.status).toBe(200);
            // Alterada (catálogo §9.1): total 300 → "300.00". pct é percentual e segue número.
            expect(mix.body).toEqual([expect.objectContaining({ method: 'DINHEIRO', count: 1, total: '300.00', pct: 100 })]);
        });

        it('reserva cujo único pagamento foi anulado volta a aparecer como em aberto', async () => {
            const reservation = await newReservation(hotel, { check_in_date: '2031-03-01', check_out_date: '2031-03-02' });
            // "Em aberto" é reserva ativa (CONFIRMED ou CHECKED_IN) com saldo.
            await confirm(reservation.id);
            const payment = await pay(hotel.jwt, { reservation_id: reservation.id, amount: '500.00' });

            const before = await read('/analytics/revenue', hotel.jwt);
            expect(before.body.unpaid.map((u) => u.reservation_id)).not.toContain(reservation.id);

            await voidPayment(hotel.jwt, payment.id, 'Lançado na reserva errada');
            const after = await read('/analytics/revenue', hotel.jwt);
            expect(after.body.unpaid.map((u) => u.reservation_id)).toContain(reservation.id);
        });

        it('D-3 refinada: com sinal parcial, a reserva continua em aberto pelo saldo', async () => {
            // Nova (D-3): no core, qualquer PAID tirava a reserva da lista de não pagas.
            const reservation = await newReservation(hotel, { check_in_date: '2031-04-01', check_out_date: '2031-04-02' });
            await confirm(reservation.id);
            await pay(hotel.jwt, { reservation_id: reservation.id, amount: '150.00' });

            const res = await read('/analytics/revenue', hotel.jwt);
            expect(res.body.unpaid.find((u) => u.reservation_id === reservation.id))
                .toMatchObject({ amount: '500.00', paid: '150.00', balance: '350.00' });
        });
    });

    // Trazido de payment-void.test.js (🟢-2): no_show_risk considera só pagamento PAID (D-3).
    describe('no-show considera só pagamento PAID (D-3)', () => {
        let hotel, today, tomorrow;

        const confirmedToday = async () => {
            const reservation = await newReservation(hotel, { check_in_date: today, check_out_date: tomorrow });
            await confirm(reservation.id);
            return reservation;
        };
        const atRisk = async () => {
            const res = await read('/analytics/alerts', hotel.jwt);
            expect(res.status).toBe(200);
            return res.body.no_show_risk.map((r) => r.reservation_id);
        };

        beforeAll(async () => {
            hotel = await newHotel('No-show', 150);
            // A data de hoje do banco, que é a que o alerta compara (CURRENT_DATE). Neste teste o
            // analytics usa o mesmo servidor PostgreSQL.
            const [[dates]] = await sequelize.query(`SELECT CURRENT_DATE::text AS today, (CURRENT_DATE + 1)::text AS tomorrow`);
            ({ today, tomorrow } = dates);
        });

        it('reserva de hoje com pagamento PAID não está em risco; estornado o pagamento, entra', async () => {
            const reservation = await confirmedToday();
            const payment = await pay(hotel.jwt, { reservation_id: reservation.id, amount: '150.00' });
            expect(await atRisk()).not.toContain(reservation.id);

            await voidPayment(hotel.jwt, payment.id, 'Cartão recusado depois');
            expect(await atRisk()).toContain(reservation.id);
        });

        it('reserva de hoje só com cobrança PIX PENDING está em risco (D-3)', async () => {
            const reservation = await confirmedToday();
            await PaymentModel.create({
                tenant_id: hotel.tenantId, reservation_id: reservation.id, amount: '50.00', method: 'PIX', status: 'PENDING',
                kind: 'DEPOSIT', provider: 'fake', provider_charge_id: `charge_${randomUUID()}`, paid_at: null
            });
            expect(await atRisk()).toContain(reservation.id);
        });

        it('reserva de hoje sem pagamento nenhum está em risco, sem o telefone do hóspede (D-1)', async () => {
            const reservation = await confirmedToday();
            expect(await atRisk()).toContain(reservation.id);
            // Alterada (D-1): o core devolvia guest_phone; agora vem guest_id para abrir a ficha no core.
            const res = await analyticsGet('/analytics/alerts', hotel.jwt);
            const row = res.body.no_show_risk.find((r) => r.reservation_id === reservation.id);
            expect(row).not.toHaveProperty('guest_phone');
            expect(row.guest_id).toBe(hotel.guest.id);
        });
    });
});

// CA-01.4.o: o monólito não responde mais os 7 indicadores (nem para ADMIN). Não depende do broker.
describe('o core não responde mais /analytics (CA-01.4.o)', () => {
    let adminJwt;

    beforeAll(async () => {
        await truncateAll();
        ({ jwt: adminJwt } = await registerAndLogin(app, { tenantName: 'Hotel Sem Analytics no Core' }));
    });

    for (const ep of ENDPOINTS) {
        it(`GET ${ep} no core → 404`, async () => {
            const res = await request(app).get(ep).set(auth(adminJwt));
            expect(res.status).toBe(404);
        });
    }

    it('/analytics/internal-consumption continua no core (decisão L-1)', async () => {
        const res = await request(app).get('/analytics/internal-consumption').set(auth(adminJwt));
        expect(res.status).toBe(200);
    });
});
