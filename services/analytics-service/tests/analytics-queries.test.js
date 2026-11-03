import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'crypto';
import createApp from '../bootstrap/createApp.js';
import sequelize from '../database/connections/sequelize.js';
import { parseEvent } from '../app/events/catalog.js';
import applyEvent from '../app/events/applyEvent.js';
import { envelope, toBuffer, truncateAll, tokenFor } from './helpers/events.js';

// CA-01.4.k — as 7 consultas de indicadores respondem a partir das projeções, com as decisões do
// catálogo §9.1: D-1 (sem telefone/e-mail), D-2 (VOIDED e excluído fora da receita), D-3 refinada
// (no-show = sem nenhum PAID; em aberto = saldo > 0) e dinheiro em NUMERIC até a resposta.
// O teste de ponta a ponta (semeado pelo core, consumido do RabbitMQ) é o
// services/core-service/tests/analytics.test.js (CA-01.4.p).

const app = createApp();
const aplicar = (env) => applyEvent(parseEvent(toBuffer(env)));
const MONEY = /^-?\d+\.\d{2}$/;

let hotelA;
let hotelB;
let today;
let ids;

const get = (url, token) => request(app).get(url).set('Authorization', `Bearer ${token}`);
const admin = () => tokenFor({ tenantId: hotelA });

function evento(type, tenantId, aggregateId, payload, extra = {}) {
    return aplicar(envelope(type, { tenantId, aggregateId, payload, ...extra }));
}

const reserva = (over) => ({
    guest_id: ids.guest, room_id: ids.room1, status: 'CONFIRMED',
    check_in_date: '2027-03-01', check_out_date: '2027-03-04', total_amount: '900.00',
    created_at: new Date().toISOString(), ...over
});
const pagamento = (over) => ({
    reservation_id: ids.resPartial, amount: '300.00', method: 'DINHEIRO', status: 'PAID',
    paid_at: new Date().toISOString(), ...over
});

beforeAll(async () => {
    await truncateAll();
    [hotelA, hotelB] = [randomUUID(), randomUUID()];
    const [{ hoje }] = await sequelize.query('SELECT CURRENT_DATE::text AS hoje', { type: 'SELECT' });
    today = hoje;
    const tomorrow = new Date(Date.parse(`${today}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
    const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);

    ids = {
        cat: randomUUID(), room1: randomUUID(), room2: randomUUID(), room3: randomUUID(), room4: randomUUID(),
        guest: randomUUID(), erased: randomUUID(),
        resPartial: randomUUID(), resPaid: randomUUID(), resNone: randomUUID(), resToday: randomUUID(),
        resTodayVoided: randomUUID(), resPending: randomUUID(), resStay: randomUUID(), resCancelled: randomUUID(),
        payVoided: randomUUID(), payDeleted: randomUUID()
    };

    for (const t of [hotelA, hotelB]) await evento('tenant.created', t, t, { status: 'ACTIVE' });
    await evento('room_category.created', hotelA, ids.cat, { name: 'Standard' });
    await evento('room.created', hotelA, ids.room1, { category_id: ids.cat, number: '101', status: 'OCCUPIED' });
    await evento('room.created', hotelA, ids.room2, { category_id: ids.cat, number: '102', status: 'OCCUPIED' });
    await evento('room.created', hotelA, ids.room3, { category_id: ids.cat, number: '103', status: 'AVAILABLE' });
    await evento('room.created', hotelA, ids.room4, { category_id: ids.cat, number: '104', status: 'CLEANING' });
    await evento('guest.created', hotelA, ids.guest, { full_name: 'Ana Ranking' });
    await evento('guest.created', hotelA, ids.erased, { full_name: 'Bruno Apagado' });
    await evento('guest.erased', hotelA, ids.erased, {});

    // Sinal de 30%: segue em aberto pelo saldo (D-3), mas não está em risco de no-show.
    await evento('reservation.created', hotelA, ids.resPartial, reserva({ total_amount: '1000.00' }));
    await evento('payment.created', hotelA, randomUUID(), pagamento({ amount: '300.00' }));
    // Paga por inteiro: fora de "em aberto".
    await evento('reservation.created', hotelA, ids.resPaid, reserva({ total_amount: '500.00', check_in_date: '2027-04-01', check_out_date: '2027-04-02' }));
    await evento('payment.created', hotelA, randomUUID(), pagamento({ reservation_id: ids.resPaid, amount: '500.00', method: 'PIX' }));
    // Sem pagamento nenhum: saldo = total.
    await evento('reservation.created', hotelA, ids.resNone, reserva({ guest_id: ids.erased, total_amount: '200.00', status: 'CHECKED_IN' }));
    // Estornado e excluído não são receita (D-2, T-06.13); PIX pendente também não.
    await evento('payment.created', hotelA, ids.payVoided, pagamento({ reservation_id: ids.resNone, amount: '100.00', method: 'CARTAO_CREDITO' }));
    await evento('payment.status_changed', hotelA, ids.payVoided, pagamento({ reservation_id: ids.resNone, amount: '100.00', method: 'CARTAO_CREDITO', status: 'VOIDED' }));
    await evento('payment.created', hotelA, ids.payDeleted, pagamento({ reservation_id: ids.resNone, amount: '50.00', method: 'PIX' }));
    await evento('payment.deleted', hotelA, ids.payDeleted, pagamento({ reservation_id: ids.resNone, amount: '50.00', method: 'PIX' }));
    await evento('payment.created', hotelA, randomUUID(), pagamento({ reservation_id: ids.resNone, amount: '70.00', method: 'PIX', status: 'PENDING', paid_at: null }));

    // Check-in hoje: sem pagamento → risco; só com pagamento estornado → risco também.
    await evento('reservation.created', hotelA, ids.resToday, reserva({ check_in_date: today, check_out_date: tomorrow, total_amount: '150.00' }));
    await evento('reservation.created', hotelA, ids.resTodayVoided, reserva({ room_id: ids.room2, check_in_date: today, check_out_date: tomorrow, total_amount: '180.00' }));
    const v = randomUUID();
    await evento('payment.created', hotelA, v, pagamento({ reservation_id: ids.resTodayVoided, amount: '180.00' }));
    await evento('payment.status_changed', hotelA, v, pagamento({ reservation_id: ids.resTodayVoided, amount: '180.00', status: 'VOIDED' }));

    // PENDING há 3 dias.
    await evento('reservation.created', hotelA, ids.resPending, reserva({
        status: 'PENDING', total_amount: '400.00', created_at: new Date(Date.now() - 72 * 3600 * 1000).toISOString()
    }));
    // Estadia que passa por hoje (ADR): 3 noites, 900,00.
    await evento('reservation.created', hotelA, ids.resStay, reserva({
        status: 'CHECKED_IN', check_in_date: yesterday, check_out_date: new Date(Date.parse(`${today}T00:00:00Z`) + 2 * 86400000).toISOString().slice(0, 10), total_amount: '900.00'
    }));
    await evento('reservation.created', hotelA, ids.resCancelled, reserva({ status: 'CANCELLED', total_amount: '9999.00' }));

    // Hotel B: um quarto e um hóspede próprios — não podem aparecer para o A, e vice-versa.
    const catB = randomUUID();
    await evento('room_category.created', hotelB, catB, { name: 'Luxo B' });
    await evento('room.created', hotelB, randomUUID(), { category_id: catB, number: '901', status: 'OCCUPIED' });
});

describe('Permissões — as mesmas do core', () => {
    const TODOS = ['/analytics/revenue', '/analytics/occupancy', '/analytics/alerts', '/analytics/seasonality',
        '/analytics/revenue-by-category', '/analytics/payment-mix', '/analytics/top-guests'];

    it.each(TODOS)('ADMIN → 200 em %s', async (url) => {
        expect((await get(url, admin())).status).toBe(200);
    });

    it.each(TODOS)('sem token → 401 em %s', async (url) => {
        expect((await request(app).get(url)).status).toBe(401);
    });

    it.each(TODOS)('WAITER → 403 em %s', async (url) => {
        expect((await get(url, tokenFor({ tenantId: hotelA, role: 'WAITER' }))).status).toBe(403);
    });

    it('RECEPTIONIST vê os indicadores, mas não o ranking de hóspedes (RT-51)', async () => {
        const recepcao = tokenFor({ tenantId: hotelA, role: 'RECEPTIONIST' });
        for (const url of TODOS.filter((u) => u !== '/analytics/top-guests')) {
            expect((await get(url, recepcao)).status, url).toBe(200);
        }
        expect((await get('/analytics/top-guests', recepcao)).status).toBe(403);
    });

    it('/analytics/internal-consumption não existe aqui — segue no core (L-1)', async () => {
        expect((await get('/analytics/internal-consumption', admin())).status).toBe(404);
    });
});

describe('Isolamento por tenant (CA-01.4.m)', () => {
    it('o hotel B não vê nada do hotel A', async () => {
        const b = tokenFor({ tenantId: hotelB });
        const revenue = (await get('/analytics/revenue', b)).body;
        expect(revenue.realized.total).toBe('0.00');
        expect(revenue.expected.total).toBe('0.00');
        expect(revenue.unpaid).toEqual([]);
        expect((await get('/analytics/top-guests', b)).body).toEqual([]);
        expect((await get('/analytics/payment-mix', b)).body).toEqual([]);
        const occ = (await get('/analytics/occupancy', b)).body;
        expect(occ).toMatchObject({ total_rooms: 1, occupied: 1 });
        const alerts = (await get('/analytics/alerts', b)).body;
        expect(alerts).toEqual({ no_show_risk: [], cleaning_pending: [], pending_too_long: [] });
    });

    it('tenantId de query ou header não muda o hotel consultado', async () => {
        const res = await get(`/analytics/top-guests?tenant_id=${hotelA}&tenantId=${hotelA}`, tokenFor({ tenantId: hotelB }))
            .set('X-Tenant-Id', hotelA);
        expect(res.body).toEqual([]);
    });
});

describe('GET /analytics/revenue', () => {
    it('realizado = só PAID (VOIDED, excluído e PENDING fora — D-2), em string decimal', async () => {
        const { body } = await get('/analytics/revenue', admin());
        expect(body.realized.total).toBe('800.00');
        expect(body.realized.by_month).toHaveLength(1);
        expect(body.realized.by_month[0].total).toBe('800.00');
        expect(body.realized.by_month[0].month).toBe(new Date().toISOString().slice(0, 7));
    });

    it('esperado = reservas CONFIRMED e CHECKED_IN', async () => {
        const { body } = await get('/analytics/revenue', admin());
        // 1000 + 500 + 200 + 150 + 180 + 900 (CHECKED_IN da estadia) = 2930; PENDING e CANCELLED fora.
        expect(body.expected.total).toBe('2930.00');
    });

    it('em aberto = saldo > 0 (D-3): o sinal de 30% continua devendo 70%; a paga sai', async () => {
        const { body } = await get('/analytics/revenue', admin());
        const porId = Object.fromEntries(body.unpaid.map((u) => [u.reservation_id, u]));
        expect(porId[ids.resPartial]).toMatchObject({ amount: '1000.00', paid: '300.00', balance: '700.00', guest: 'Ana Ranking', guest_id: ids.guest });
        expect(porId[ids.resNone]).toMatchObject({ amount: '200.00', paid: '0.00', balance: '200.00', guest: 'Hóspede eliminado' });
        expect(porId[ids.resPaid]).toBeUndefined();
        expect(porId[ids.resPending]).toBeUndefined();
        expect(porId[ids.resCancelled]).toBeUndefined();
    });

    it('filtro de período por paid_at', async () => {
        const fora = (await get('/analytics/revenue?start=2020-01-01&end=2020-12-31', admin())).body;
        expect(fora.realized).toEqual({ total: '0.00', by_month: [] });
        const dentro = (await get(`/analytics/revenue?start=${today.slice(0, 8)}01&end=2099-12-31`, admin())).body;
        expect(dentro.realized.total).toBe('800.00');
    });

    it.each([
        ['data inexistente', 'start=2026-02-30&end=2026-03-01'],
        ['formato errado', 'start=01/01/2026&end=2026-03-01'],
        ['start depois de end', 'start=2026-03-02&end=2026-03-01'],
        ['parâmetro repetido', 'start=2026-01-01&start=2026-01-02&end=2026-03-01']
    ])('400 com %s', async (_, qs) => {
        const res = await get(`/analytics/revenue?${qs}`, admin());
        expect(res.status).toBe(400);
        expect(res.body.error).toBeTruthy();
    });
});

describe('GET /analytics/payment-mix', () => {
    it('só PAID, total em string, pct em número', async () => {
        const { body } = await get('/analytics/payment-mix', admin());
        expect(body).toEqual([
            { method: 'PIX', count: 1, total: '500.00', pct: 62.5 },
            { method: 'DINHEIRO', count: 1, total: '300.00', pct: 37.5 }
        ]);
    });

    it('400 com período inválido', async () => {
        expect((await get('/analytics/payment-mix?start=x&end=y', admin())).status).toBe(400);
    });
});

describe('GET /analytics/alerts', () => {
    it('no-show = CONFIRMED de hoje sem nenhum PAID (D-3); estornado não é garantia', async () => {
        const { body } = await get('/analytics/alerts', admin());
        const risco = body.no_show_risk.map((r) => r.reservation_id);
        expect(risco).toEqual([ids.resTodayVoided, ids.resToday]);   // maior valor primeiro
        expect(risco).not.toContain(ids.resPartial);
    });

    it('sem telefone nem e-mail (D-1); traz guest_id para abrir a ficha no core', async () => {
        const { body } = await get('/analytics/alerts', admin());
        for (const lista of [body.no_show_risk, body.pending_too_long]) {
            for (const row of lista) {
                expect(row).not.toHaveProperty('guest_phone');
                expect(row).not.toHaveProperty('email');
                expect(row.guest_id).toBe(ids.guest);
                expect(row.amount).toMatch(MONEY);
            }
        }
    });

    it('quarto em limpeza com o instante do evento', async () => {
        const { body } = await get('/analytics/alerts', admin());
        expect(body.cleaning_pending).toEqual([
            expect.objectContaining({ room_id: ids.room4, room_number: '104', category: 'Standard' })
        ]);
        expect(Date.parse(body.cleaning_pending[0].cleaning_since)).not.toBeNaN();
    });

    it('PENDING há mais de 48 h, com as horas', async () => {
        const { body } = await get('/analytics/alerts', admin());
        expect(body.pending_too_long).toHaveLength(1);
        expect(body.pending_too_long[0]).toMatchObject({ reservation_id: ids.resPending, amount: '400.00' });
        expect(body.pending_too_long[0].hours_pending).toBeGreaterThanOrEqual(71.9);
    });
});

describe('GET /analytics/occupancy', () => {
    it('contagem, taxa, ADR e RevPAR (dinheiro em string)', async () => {
        const { body } = await get(`/analytics/occupancy?date=${today}`, admin());
        expect(body).toEqual({
            date: today, total_rooms: 4, occupied: 2, available: 1, cleaning: 1,
            occupancy_rate: 50, adr: '300.00', revpar: '150.00'
        });
    });

    it('sem date usa o dia de hoje em UTC, como o core', async () => {
        const { body } = await get('/analytics/occupancy', admin());
        expect(body.date).toBe(new Date().toISOString().slice(0, 10));
    });

    it('dia sem estadia: ADR e RevPAR zerados', async () => {
        const { body } = await get('/analytics/occupancy?date=2020-01-01', admin());
        expect(body).toMatchObject({ adr: '0.00', revpar: '0.00' });
    });

    it('hotel sem quarto: taxa 0, sem divisão por zero', async () => {
        const vazio = randomUUID();
        await evento('tenant.created', vazio, vazio, { status: 'ACTIVE' });
        const { body } = await get('/analytics/occupancy', tokenFor({ tenantId: vazio }));
        expect(body).toMatchObject({ total_rooms: 0, occupancy_rate: 0, adr: '0.00', revpar: '0.00' });
    });

    it('400 com date inválida (no core virava 500)', async () => {
        expect((await get('/analytics/occupancy?date=2026-13-01', admin())).status).toBe(400);
    });
});

describe('GET /analytics/seasonality', () => {
    it('agrupa por mês de check-in, sem cancelada; receita em string', async () => {
        const { body } = await get('/analytics/seasonality?months=60', admin());
        const marco = body.find((m) => m.month === '2027-03');
        // Reservas de março/2027: parcial (1000), sem pagamento (200), pendente (400).
        expect(marco).toEqual({ month: '2027-03', reservations: 3, revenue: '1600.00', avg_nights: 3 });
        for (const m of body) expect(m.revenue).toMatch(MONEY);
    });

    it.each(['0', '61', 'abc', '5abc'])('400 com months=%s', async (months) => {
        expect((await get(`/analytics/seasonality?months=${months}`, admin())).status).toBe(400);
    });
});

describe('GET /analytics/revenue-by-category', () => {
    it('receita e ticket médio em string; cancelada fora', async () => {
        const { body } = await get('/analytics/revenue-by-category', admin());
        // 1000 + 500 + 200 + 150 + 180 + 400 + 900 = 3330 em 7 reservas → 475,71
        expect(body).toEqual([{ category: 'Standard', reservations: 7, revenue: '3330.00', avg_ticket: '475.71' }]);
    });

    it('filtro pelo check-in', async () => {
        const { body } = await get('/analytics/revenue-by-category?start=2027-04-01&end=2027-04-30', admin());
        expect(body).toEqual([{ category: 'Standard', reservations: 1, revenue: '500.00', avg_ticket: '500.00' }]);
    });

    it('400 com período invertido', async () => {
        expect((await get('/analytics/revenue-by-category?start=2027-05-01&end=2027-04-01', admin())).status).toBe(400);
    });
});

describe('GET /analytics/top-guests', () => {
    it('ranking sem e-mail (D-1), valor em string; eliminado aparece anonimizado', async () => {
        const { body } = await get('/analytics/top-guests', admin());
        expect(body[0]).toMatchObject({ guest_id: ids.guest, full_name: 'Ana Ranking', total_reservations: 6, lifetime_value: '3130.00' });
        expect(body[1]).toMatchObject({ guest_id: ids.erased, full_name: 'Hóspede eliminado', lifetime_value: '200.00' });
        for (const row of body) {
            expect(Object.keys(row).sort()).toEqual(['full_name', 'guest_id', 'last_stay', 'lifetime_value', 'total_reservations']);
        }
    });

    it('limit', async () => {
        expect((await get('/analytics/top-guests?limit=1', admin())).body).toHaveLength(1);
    });

    it.each(['0', '101', 'x'])('400 com limit=%s', async (limit) => {
        expect((await get(`/analytics/top-guests?limit=${limit}`, admin())).status).toBe(400);
    });
});

// 🟡-1 do qa-redteam da H.3: o hotel vizinho tem hóspede, reserva, pagamento e categoria reais, e há
// referências cruzadas forjadas nos eventos (reserva de A com hóspede de B, quarto de A com categoria
// de B, reserva de A em quarto de B, pagamento de B apontando para reserva de A, reserva de B com
// hóspede de A). Cada rota de A é conferida por IGUALDADE com os totais esperados — perder qualquer
// filtro de tenant (WHERE, JOIN ou subquery) muda o número. Mutações que este bloco mata: M4, M5,
// M8, M9, M10, M15, M16, M17 e M18 (relatório docs/qa/redteam_analytics-cutover-h3_02112026.md).
describe('Isolamento com o hotel vizinho povoado e referências cruzadas (CA-01.4.m)', () => {
    let vitima;
    let vizinho;
    let x;
    const comoVitima = () => tokenFor({ tenantId: vitima });

    beforeAll(async () => {
        [vitima, vizinho] = [randomUUID(), randomUUID()];
        x = {
            catA: randomUUID(), catB: randomUUID(),
            rA1: randomUUID(), rA2: randomUUID(), rB1: randomUUID(), rB2: randomUUID(), rB3: randomUUID(),
            gA: randomUUID(), gB: randomUUID(),
            resA1: randomUUID(), resA2: randomUUID(), resA3: randomUUID(), resA4: randomUUID(),
            resB1: randomUUID(), resB2: randomUUID(), resB3: randomUUID()
        };
        const tomorrow = new Date(Date.parse(`${today}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
        const agora = new Date().toISOString();
        const res = (over) => ({ status: 'CONFIRMED', created_at: agora, ...over });
        const pay = (over) => ({ status: 'PAID', paid_at: agora, ...over });

        for (const t of [vitima, vizinho]) await evento('tenant.created', t, t, { status: 'ACTIVE' });

        // Vizinho (B): dados reais, com valores que não se confundem com os de A.
        await evento('room_category.created', vizinho, x.catB, { name: 'SEGREDO-CAT-B' });
        await evento('room.created', vizinho, x.rB1, { category_id: x.catB, number: '901', status: 'OCCUPIED' });
        await evento('room.created', vizinho, x.rB2, { category_id: x.catB, number: '902', status: 'CLEANING' });
        await evento('guest.created', vizinho, x.gB, { full_name: 'SEGREDO-HOSPEDE-B' });
        await evento('reservation.created', vizinho, x.resB1, res({
            guest_id: x.gB, room_id: x.rB1, check_in_date: today, check_out_date: tomorrow, total_amount: '5555.00'
        }));
        await evento('payment.created', vizinho, randomUUID(), pay({ reservation_id: x.resB1, amount: '5555.00', method: 'CARTAO_DEBITO' }));

        // Vítima (A).
        await evento('room_category.created', vitima, x.catA, { name: 'Cat A' });
        await evento('room.created', vitima, x.rA1, { category_id: x.catA, number: '101', status: 'OCCUPIED' });
        // Cruzado: quarto de A com a categoria de B (M10, M16).
        await evento('room.created', vitima, x.rA2, { category_id: x.catB, number: '102', status: 'CLEANING' });
        await evento('guest.created', vitima, x.gA, { full_name: 'Hóspede A' });
        // Cruzado: check-in hoje com o hóspede de B (M8 pelo pagamento abaixo; M5/M9 pelo nome).
        await evento('reservation.created', vitima, x.resA1, res({
            guest_id: x.gB, room_id: x.rA1, check_in_date: today, check_out_date: tomorrow, total_amount: '100.00'
        }));
        await evento('reservation.created', vitima, x.resA2, res({
            guest_id: x.gA, room_id: x.rA2, check_in_date: '2027-05-10', check_out_date: '2027-05-12', total_amount: '200.00'
        }));
        // Cruzado: PENDING antiga com o hóspede de B (M9).
        await evento('reservation.created', vitima, x.resA3, res({
            status: 'PENDING', guest_id: x.gB, room_id: x.rA1, check_in_date: '2027-05-20', check_out_date: '2027-05-21',
            total_amount: '300.00', created_at: new Date(Date.now() - 72 * 3600 * 1000).toISOString()
        }));
        // Cruzado: reserva de A num quarto de B que aponta para a categoria de A (M16, filtro do quarto).
        await evento('room.created', vizinho, x.rB3, { category_id: x.catA, number: '903', status: 'AVAILABLE' });
        await evento('reservation.created', vitima, x.resA4, res({
            guest_id: x.gA, room_id: x.rB3, check_in_date: '2027-06-01', check_out_date: '2027-06-03', total_amount: '400.00'
        }));
        await evento('payment.created', vitima, randomUUID(), pay({ reservation_id: x.resA2, amount: '50.00', method: 'PIX' }));

        // Cruzados do lado de B: pagamento de B para a reserva de A (M4, M8), reserva de B com o
        // hóspede de A (M17) e reserva de B num quarto de A (M16, filtro da reserva).
        await evento('payment.created', vizinho, randomUUID(), pay({ reservation_id: x.resA1, amount: '100.00', method: 'CARTAO_DEBITO' }));
        await evento('reservation.created', vizinho, x.resB2, res({
            guest_id: x.gA, room_id: x.rB1, check_in_date: '2027-05-15', check_out_date: '2027-05-16', total_amount: '777.00'
        }));
        await evento('reservation.created', vizinho, x.resB3, res({
            guest_id: x.gB, room_id: x.rA1, check_in_date: '2027-07-01', check_out_date: '2027-07-02', total_amount: '33.00'
        }));
    });

    it('revenue: realizado, esperado e em aberto exatos; pagamento de B não abate saldo de A (M4) e nome de B não aparece (M5)', async () => {
        const { body } = await get('/analytics/revenue', comoVitima());
        expect(body.realized).toEqual({ total: '50.00', by_month: [{ month: new Date().toISOString().slice(0, 7), total: '50.00' }] });
        expect(body.expected).toEqual({ total: '700.00' });   // 100 + 200 + 400; PENDING fora
        expect(body.unpaid.map(({ reservation_id, guest_id, guest, amount, paid, balance }) =>
            ({ reservation_id, guest_id, guest, amount, paid, balance }))).toEqual([
            { reservation_id: x.resA1, guest_id: x.gB, guest: null, amount: '100.00', paid: '0.00', balance: '100.00' },
            { reservation_id: x.resA2, guest_id: x.gA, guest: 'Hóspede A', amount: '200.00', paid: '50.00', balance: '150.00' },
            { reservation_id: x.resA4, guest_id: x.gA, guest: 'Hóspede A', amount: '400.00', paid: '0.00', balance: '400.00' }
        ]);
    });

    it('occupancy: só os quartos de A', async () => {
        const { body } = await get(`/analytics/occupancy?date=${today}`, comoVitima());
        expect(body).toEqual({
            date: today, total_rooms: 2, occupied: 1, available: 0, cleaning: 1,
            occupancy_rate: 50, adr: '0.00', revpar: '0.00'
        });
    });

    it('alerts: no-show não some com pagamento de B (M8); hóspede e categoria de B vêm null (M9, M10)', async () => {
        const { body } = await get('/analytics/alerts', comoVitima());
        expect(body.no_show_risk.map(({ reservation_id, guest_id, guest, amount }) => ({ reservation_id, guest_id, guest, amount })))
            .toEqual([{ reservation_id: x.resA1, guest_id: x.gB, guest: null, amount: '100.00' }]);
        expect(body.cleaning_pending.map(({ room_id, room_number, category }) => ({ room_id, room_number, category })))
            .toEqual([{ room_id: x.rA2, room_number: '102', category: null }]);
        expect(body.pending_too_long.map(({ reservation_id, guest_id, guest, amount }) => ({ reservation_id, guest_id, guest, amount })))
            .toEqual([{ reservation_id: x.resA3, guest_id: x.gB, guest: null, amount: '300.00' }]);
    });

    it('seasonality: só as reservas de A, mês a mês (M15)', async () => {
        const { body } = await get('/analytics/seasonality?months=60', comoVitima());
        expect(body).toEqual([
            { month: today.slice(0, 7), reservations: 1, revenue: '100.00', avg_nights: 1 },
            { month: '2027-05', reservations: 2, revenue: '500.00', avg_nights: 1.5 },
            { month: '2027-06', reservations: 1, revenue: '400.00', avg_nights: 2 }
        ]);
    });

    it('revenue-by-category: nada de B entra nas categorias de A (M16)', async () => {
        const { body } = await get('/analytics/revenue-by-category', comoVitima());
        // resA1 + resA3 no quarto 101 (Cat A). A resA2 (quarto de A com categoria de B) e a resA4
        // (quarto de B) saem com o INNER JOIN — ver 🟢-5 do qa-redteam, pendente na retomada. A resB3
        // (reserva de B no quarto 101) não entra.
        expect(body).toEqual([{ category: 'Cat A', reservations: 2, revenue: '400.00', avg_ticket: '200.00' }]);
    });

    it('payment-mix: só o pagamento de A', async () => {
        const { body } = await get('/analytics/payment-mix', comoVitima());
        expect(body).toEqual([{ method: 'PIX', count: 1, total: '50.00', pct: 100 }]);
    });

    it('top-guests: reserva de B com hóspede de A não soma (M17); hóspede de B não entra (M18)', async () => {
        const { body } = await get('/analytics/top-guests', comoVitima());
        expect(body).toHaveLength(1);
        expect(body[0]).toMatchObject({ guest_id: x.gA, full_name: 'Hóspede A', total_reservations: 2, lifetime_value: '600.00' });
    });

    it('o vizinho também só vê o que é dele', async () => {
        const b = tokenFor({ tenantId: vizinho });
        expect((await get('/analytics/revenue', b)).body.realized.total).toBe('5655.00');   // 5555 + 100 (pagamento cruzado é dele)
        expect((await get('/analytics/top-guests', b)).body).toEqual([
            expect.objectContaining({ guest_id: x.gB, full_name: 'SEGREDO-HOSPEDE-B', total_reservations: 2, lifetime_value: '5588.00' })
        ]);
    });
});

// 🟢-1 do qa-redteam da H.3 (mutação M24): RevPAR com UM arredondamento só (decisão 2). 1000,00 em 3
// noites, 1 de 3 quartos ocupado: ADR 333.33; RevPAR = 333.333… × 1/3 = 111.11. A fórmula do core
// (ADR arredondado × taxa arredondada) daria 111.10.
describe('RevPAR com arredondamento único', () => {
    it('ADR 333.33 e RevPAR 111.11', async () => {
        const hotel = randomUUID();
        const [cat, r1, r2, r3, guest] = [randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID()];
        const dia = (n) => new Date(Date.parse(`${today}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
        await evento('tenant.created', hotel, hotel, { status: 'ACTIVE' });
        await evento('room_category.created', hotel, cat, { name: 'Std' });
        await evento('room.created', hotel, r1, { category_id: cat, number: '1', status: 'OCCUPIED' });
        await evento('room.created', hotel, r2, { category_id: cat, number: '2', status: 'AVAILABLE' });
        await evento('room.created', hotel, r3, { category_id: cat, number: '3', status: 'AVAILABLE' });
        await evento('guest.created', hotel, guest, { full_name: 'Hóspede' });
        await evento('reservation.created', hotel, randomUUID(), {
            guest_id: guest, room_id: r1, status: 'CHECKED_IN', check_in_date: dia(-1), check_out_date: dia(2),
            total_amount: '1000.00', created_at: new Date().toISOString()
        });
        const { body } = await get(`/analytics/occupancy?date=${today}`, tokenFor({ tenantId: hotel }));
        expect(body).toMatchObject({ total_rooms: 3, occupied: 1, occupancy_rate: 33.33, adr: '333.33', revpar: '111.11' });
    });
});

describe('Falha do banco não vaza detalhe', () => {
    it('erro na consulta → 500 genérico', async () => {
        const original = sequelize.query.bind(sequelize);
        let chamadas = 0;
        sequelize.query = async (sql, opts) => {
            // A 1ª consulta é a do tenantMiddleware (findOne); as seguintes são do controller.
            if (++chamadas > 1) throw new Error('connection to 10.0.0.5 refused');
            return original(sql, opts);
        };
        try {
            for (const url of ['/analytics/revenue', '/analytics/occupancy', '/analytics/alerts', '/analytics/seasonality',
                '/analytics/revenue-by-category', '/analytics/payment-mix', '/analytics/top-guests']) {
                chamadas = 0;
                const res = await get(url, admin());
                expect(res.status, url).toBe(500);
                expect(res.body).toEqual({ error: 'Erro interno do servidor' });
            }
        } finally {
            sequelize.query = original;
        }
    });
});
