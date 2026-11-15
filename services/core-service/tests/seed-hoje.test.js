// M8 — seed com as datas do dia (pedido do Weslley de 31/10, §3.1; plano de fechamento de 15/11).
// O seed_hoje.sql ancora o cenário da demonstração no dia em que roda, no fuso do hotel. Os testes
// fixam o relógio pela variável de sessão `seed.agora` (a mesma que o arquivo lê) para provar o
// cenário num dia conhecido, a troca de dia e o corte do fuso. Um bloco final roda com o relógio
// real e confere pela API, como o painel Hoje do app lê.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { QueryTypes } from 'sequelize';
import sequelize from '../database/connections/sequelize.js';
import { createApp } from './helpers/createApp.js';
import { truncateAll } from './helpers/db.js';

const app = createApp();
const seedDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'seed');
const TZ = 'America/Sao_Paulo';

// Mesma ordem do `node command.js seed`. `agora` simula o relógio; sem ele, vale o now() do banco.
async function runSeed(agora) {
    for (const file of ['seed_hotels.sql', 'seed_consumo.sql', 'seed_hoje.sql']) {
        const sql = await readFile(path.join(seedDir, file), 'utf-8');
        // Uma chamada só = uma conexão: o SET vale para o arquivo e o RESET devolve o pool limpo.
        await sequelize.query(agora ? `SET seed.agora = '${agora}'; ${sql}; RESET seed.agora;` : sql);
    }
}

const q = (sql, replacements = {}) => sequelize.query(sql, { type: QueryTypes.SELECT, replacements });
const one = async (sql, replacements) => (await q(sql, replacements))[0];

const TABLES = ['reservations', 'payments', 'accounts', 'account_items', 'rooms', 'guests'];
const counts = async () =>
    Object.fromEntries(await Promise.all(TABLES.map(async (t) => [t, (await one(`SELECT COUNT(*)::int AS n FROM ${t}`)).n])));

// Retrato do dia `hoje` num hotel — o que o painel Hoje e os cartões do gerente contam.
async function scenario(subdomain, hoje, agora) {
    const base = { subdomain, hoje, agora };
    const tenant = `(SELECT id FROM tenants WHERE subdomain = :subdomain)`;
    return {
        arrivals: (await one(`SELECT COUNT(*)::int AS n FROM reservations
            WHERE tenant_id = ${tenant} AND deleted_at IS NULL AND status IN ('PENDING','CONFIRMED')
              AND check_in_date = :hoje`, base)).n,
        inHouse: (await one(`SELECT COUNT(*)::int AS n FROM reservations
            WHERE tenant_id = ${tenant} AND deleted_at IS NULL AND status = 'CHECKED_IN'`, base)).n,
        departures: (await one(`SELECT COUNT(*)::int AS n FROM reservations
            WHERE tenant_id = ${tenant} AND deleted_at IS NULL AND status = 'CHECKED_IN'
              AND check_out_date = :hoje`, base)).n,
        // Risco de no-show, mesma regra do analytics (D-3): CONFIRMED de hoje sem pagamento PAID.
        noShow: (await one(`SELECT COUNT(*)::int AS n FROM reservations r
            WHERE r.tenant_id = ${tenant} AND r.deleted_at IS NULL AND r.status = 'CONFIRMED'
              AND r.check_in_date = :hoje
              AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.reservation_id = r.id
                                AND p.status = 'PAID' AND p.deleted_at IS NULL)`, base)).n,
        cleaning: (await one(`SELECT COUNT(*)::int AS n FROM rooms
            WHERE tenant_id = ${tenant} AND deleted_at IS NULL AND status = 'CLEANING'`, base)).n,
        occupied: (await one(`SELECT COUNT(*)::int AS n FROM rooms
            WHERE tenant_id = ${tenant} AND deleted_at IS NULL AND status = 'OCCUPIED'`, base)).n,
        paidToday: (await one(`SELECT COUNT(*)::int AS n FROM payments
            WHERE tenant_id = ${tenant} AND deleted_at IS NULL AND status = 'PAID'
              AND (paid_at AT TIME ZONE '${TZ}')::date = :hoje`, base)).n,
        paidInFuture: (await one(`SELECT COUNT(*)::int AS n FROM payments
            WHERE tenant_id = ${tenant} AND paid_at > CAST(:agora AS timestamptz)`, base)).n
    };
}

// O que o roteiro precisa ver em cada hotel, em qualquer dia em que o seed rode.
const ESPERADO = {
    aurora: { arrivals: 2, inHouse: 4, departures: 1, noShow: 1, cleaning: 1, occupied: 4, paidToday: 2, paidInFuture: 0 },
    sol:    { arrivals: 1, inHouse: 2, departures: 1, noShow: 0, cleaning: 1, occupied: 2, paidToday: 2, paidInFuture: 0 }
};

// Invariantes que a API nunca quebra e que o seed, escrevendo direto no banco, também não pode.
async function invariants(hoje, agora) {
    return {
        // estadia em andamento ⇔ quarto ocupado (achado 1 da revisão de 15/11)
        checkedInRoomNotOccupied: (await one(`SELECT COUNT(*)::int AS n FROM reservations r
            JOIN rooms rm ON rm.id = r.room_id
            WHERE r.status = 'CHECKED_IN' AND r.deleted_at IS NULL AND rm.status <> 'OCCUPIED'`)).n,
        occupiedWithoutStay: (await one(`SELECT COUNT(*)::int AS n FROM rooms rm
            WHERE rm.status = 'OCCUPIED' AND rm.deleted_at IS NULL
              AND NOT EXISTS (SELECT 1 FROM reservations r WHERE r.room_id = rm.id
                                AND r.status = 'CHECKED_IN' AND r.deleted_at IS NULL)`)).n,
        // janela do check-in (#147): a estadia em andamento começou até hoje e não terminou antes de hoje
        stayOutsideToday: (await one(`SELECT COUNT(*)::int AS n FROM reservations
            WHERE status = 'CHECKED_IN' AND deleted_at IS NULL
              AND NOT (check_in_date <= :hoje AND check_out_date >= :hoje)`, { hoje })).n,
        // conta da suíte abre no dia da entrada, às 14h do hotel (D-58), e nada foi consumido no futuro
        lodgingOpenedOffDay: (await one(`SELECT COUNT(*)::int AS n FROM accounts a
            JOIN reservations r ON r.id = a.reservation_id
            WHERE a.charges_lodging AND a.status = 'OPEN'
              AND to_char(a.opened_at AT TIME ZONE '${TZ}', 'YYYY-MM-DD HH24:MI') <> to_char(r.check_in_date, 'YYYY-MM-DD') || ' 14:00'`)).n,
        itemsInFuture: (await one(`SELECT COUNT(*)::int AS n FROM account_items
            WHERE consumed_at > CAST(:agora AS timestamptz)`, { agora })).n,
        itemsBeforeOpening: (await one(`SELECT COUNT(*)::int AS n FROM account_items ai
            JOIN accounts a ON a.id = ai.account_id
            WHERE a.type <> 'INTERNAL' AND ai.consumed_at < a.opened_at`)).n,
        // mesa e day-use abertos são do dia (ou de ontem, se o seed roda cedo), nunca de junho
        staleOpenAccounts: (await one(`SELECT COUNT(*)::int AS n FROM accounts
            WHERE status = 'OPEN' AND type IN ('TABLE','DAY_USE')
              AND (opened_at AT TIME ZONE '${TZ}')::date < CAST(:hoje AS date) - 1`, { hoje })).n
    };
}

const SEM_QUEBRA = {
    checkedInRoomNotOccupied: 0, occupiedWithoutStay: 0, stayOutsideToday: 0,
    lodgingOpenedOffDay: 0, itemsInFuture: 0, itemsBeforeOpening: 0, staleOpenAccounts: 0
};

describe('seed do dia — cenário num dia conhecido', () => {
    const AGORA = '2026-12-10 15:00-03';
    const HOJE = '2026-12-10';

    beforeAll(async () => {
        await truncateAll();
        await runSeed(AGORA);
    });

    it('Hotel Aurora tem chegadas, saída, hóspedes na casa, no-show, limpeza e pagamento do dia', async () => {
        expect(await scenario('aurora', HOJE, AGORA)).toEqual(ESPERADO.aurora);
    });

    it('Pousada Sol também tem o cenário do dia (os dois hotéis do seed)', async () => {
        expect(await scenario('sol', HOJE, AGORA)).toEqual(ESPERADO.sol);
    });

    it('não quebra nenhuma regra da API: quarto x estadia, janela do check-in, conta e consumo', async () => {
        expect(await invariants(HOJE, AGORA)).toEqual(SEM_QUEBRA);
    });

    it('a estadia mantém as noites e o valor do arquivo (diária × noites)', async () => {
        const rows = await q(`SELECT rm.number, r.check_out_date - r.check_in_date AS nights, r.total_amount::numeric AS total,
                                     rc.price_per_night::numeric AS price
                                FROM reservations r JOIN rooms rm ON rm.id = r.room_id
                                JOIN room_categories rc ON rc.id = rm.category_id
                               WHERE r.deleted_at IS NULL AND r.status IN ('CHECKED_IN','CONFIRMED')
                                 AND r.check_out_date >= :hoje`, { hoje: HOJE });
        expect(rows.length).toBeGreaterThan(0);
        for (const r of rows) expect({ room: r.number, total: Number(r.total) }).toEqual({ room: r.number, total: Number(r.price) * r.nights });
    });
});

describe('seed do dia — rodar de novo', () => {
    it('no mesmo dia não duplica nem muda nada', async () => {
        await truncateAll();
        await runSeed('2026-12-10 09:00-03');
        const antes = await counts();
        const datas = await q(`SELECT id, check_in_date, check_out_date, status FROM reservations ORDER BY id`);
        await runSeed('2026-12-10 18:00-03');
        expect(await counts()).toEqual(antes);
        expect(await q(`SELECT id, check_in_date, check_out_date, status FROM reservations ORDER BY id`)).toEqual(datas);
    });

    it('em outro dia leva o cenário para o novo dia, sem criar linhas', async () => {
        await truncateAll();
        await runSeed('2026-12-10 15:00-03');
        const antes = await counts();
        await runSeed('2026-12-13 15:00-03');
        expect(await counts()).toEqual(antes);
        expect(await scenario('aurora', '2026-12-13', '2026-12-13 15:00-03')).toEqual(ESPERADO.aurora);
        expect(await scenario('sol', '2026-12-13', '2026-12-13 15:00-03')).toEqual(ESPERADO.sol);
        expect(await invariants('2026-12-13', '2026-12-13 15:00-03')).toEqual(SEM_QUEBRA);
    });

    it('não desfaz o que a demonstração fez: reserva que mudou de situação fica como está', async () => {
        await truncateAll();
        await runSeed('2026-12-10 15:00-03');
        // A recepção cancelou a chegada sem sinal (quarto 102) durante a demonstração.
        await sequelize.query(`UPDATE reservations SET status = 'CANCELLED'
            WHERE room_id = (SELECT rm.id FROM rooms rm JOIN tenants t ON t.id = rm.tenant_id
                              WHERE t.subdomain = 'aurora' AND rm.number = '102')
              AND check_in_date = '2026-12-10'`);
        await runSeed('2026-12-11 15:00-03');
        const r = await one(`SELECT r.status, r.check_in_date::text AS ci FROM reservations r
            JOIN guests g ON g.id = r.guest_id AND g.cpf = '30000000023'`);
        expect(r).toEqual({ status: 'CANCELLED', ci: '2026-12-10' });
    });
});

describe('seed do dia — fuso do hotel', () => {
    it('rodado às 22h30 em Brasília (01h30 UTC do dia seguinte) usa o dia de Brasília', async () => {
        await truncateAll();
        await runSeed('2026-12-11 01:30+00');
        expect(await scenario('aurora', '2026-12-10', '2026-12-11 01:30+00')).toEqual(ESPERADO.aurora);
        expect(await invariants('2026-12-10', '2026-12-11 01:30+00')).toEqual(SEM_QUEBRA);
    });

    it('rodado às 00h20 o pagamento do dia não fica no futuro', async () => {
        await truncateAll();
        await runSeed('2026-12-10 00:20-03');
        expect(await scenario('aurora', '2026-12-10', '2026-12-10 00:20-03')).toEqual(ESPERADO.aurora);
        expect(await invariants('2026-12-10', '2026-12-10 00:20-03')).toEqual(SEM_QUEBRA);
    });
});

describe('seed do dia — relógio real, lido pela API como o painel Hoje', () => {
    let auth;
    let hoje;

    beforeAll(async () => {
        await truncateAll();
        await runSeed();
        hoje = (await one(`SELECT to_char((now() AT TIME ZONE '${TZ}')::date, 'YYYY-MM-DD') AS d`)).d;
        const res = await request(app).post('/auth/login').send({ email: 'recep1@aurora.example', password: 'senha123' });
        auth = { Authorization: `Bearer ${res.body.token}` };
    });

    it('chegadas do dia e hóspedes na casa saem pelo GET /reservations', async () => {
        const arrivals = await request(app).get(`/reservations?from=${hoje}&to=${hoje}&status=PENDING,CONFIRMED`).set(auth);
        expect(arrivals.status).toBe(200);
        expect(arrivals.body.data.filter((r) => r.check_in_date === hoje)).toHaveLength(2);

        const inHouse = await request(app).get('/reservations?status=CHECKED_IN').set(auth);
        expect(inHouse.body.data).toHaveLength(4);
        expect(inHouse.body.data.every((r) => r.room.status === 'OCCUPIED')).toBe(true);
    });

    it('a recepção faz o check-in da chegada com sinal e libera o quarto em limpeza', async () => {
        const arrivals = (await request(app).get(`/reservations?from=${hoje}&to=${hoje}&status=CONFIRMED`).set(auth)).body.data;
        const comSinal = arrivals.find((r) => r.room.number === '201');
        const checkIn = await request(app).put(`/reservations/${comSinal.id}/check-in`).set(auth);
        expect(checkIn.status).toBe(200);

        const rooms = (await request(app).get('/rooms').set(auth)).body;
        const lista = Array.isArray(rooms) ? rooms : rooms.data;
        const limpeza = lista.find((r) => r.status === 'CLEANING');
        expect(limpeza.number).toBe('105');
        const release = await request(app).put(`/rooms/${limpeza.id}/release`).set(auth);
        expect(release.status).toBe(200);
    });
});
