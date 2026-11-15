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

    it('não desfaz o check-in feito na demonstração nem mexe no sinal dela', async () => {
        await truncateAll();
        await runSeed('2026-12-10 15:00-03');
        // A recepção fez o check-in da chegada com sinal (quarto 201), como no passo 2 do roteiro.
        await sequelize.query(`
            UPDATE reservations SET status = 'CHECKED_IN'
             WHERE guest_id = (SELECT id FROM guests WHERE cpf = '30000000022');
            UPDATE rooms SET status = 'OCCUPIED'
             WHERE number = '201' AND tenant_id = (SELECT id FROM tenants WHERE subdomain = 'aurora');
            -- o check-in abre a conta da suíte (D-58), como o CheckInController
            INSERT INTO accounts (id, tenant_id, type, status, reservation_id, room_id, guest_id, label,
                                  charges_lodging, opened_at, created_at, updated_at)
            SELECT gen_random_uuid(), r.tenant_id, 'ROOM', 'OPEN', r.id, r.room_id, r.guest_id, 'Suíte 201',
                   true, '2026-12-10 15:30-03', now(), now()
              FROM reservations r WHERE r.guest_id = (SELECT id FROM guests WHERE cpf = '30000000022');`);
        const antes = await counts();
        const sinal = await q(`SELECT p.reservation_id, p.amount, p.paid_at FROM payments p
            JOIN reservations r ON r.id = p.reservation_id
            JOIN guests g ON g.id = r.guest_id AND g.cpf = '30000000022'`);
        await runSeed('2026-12-11 15:00-03');
        expect(await counts()).toEqual(antes);
        expect(await q(`SELECT p.reservation_id, p.amount, p.paid_at FROM payments p
            JOIN reservations r ON r.id = p.reservation_id
            JOIN guests g ON g.id = r.guest_id AND g.cpf = '30000000022'`)).toEqual(sinal);
        const r = await one(`SELECT r.status, r.check_in_date::text AS ci FROM reservations r
            JOIN guests g ON g.id = r.guest_id AND g.cpf = '30000000022'`);
        expect(r).toEqual({ status: 'CHECKED_IN', ci: '2026-12-10' });
    });

    it('quarto extra de estadia com vários quartos continua ocupado; ocupado sem estadia volta a livre', async () => {
        await truncateAll();
        await runSeed('2026-12-10 15:00-03');
        // Quarto 108 entra como extra da estadia do 106 (reserva de vários quartos, F.4) e o 104
        // ficou ocupado sem estadia nenhuma (estado que a API não produz).
        await sequelize.query(`
            INSERT INTO reservation_rooms (id, reservation_id, room_id, created_at, updated_at)
            SELECT gen_random_uuid(), r.id, extra.id, now(), now()
              FROM reservations r
              JOIN rooms principal ON principal.id = r.room_id AND principal.number = '106'
              JOIN rooms extra ON extra.tenant_id = r.tenant_id AND extra.number = '108'
             WHERE r.status = 'CHECKED_IN';
            UPDATE rooms SET status = 'OCCUPIED'
             WHERE number IN ('104', '108') AND tenant_id = (SELECT id FROM tenants WHERE subdomain = 'aurora');`);
        await runSeed('2026-12-10 16:00-03');
        const status = Object.fromEntries((await q(`SELECT rm.number, rm.status FROM rooms rm
            JOIN tenants t ON t.id = rm.tenant_id AND t.subdomain = 'aurora'
            WHERE rm.number IN ('104', '108')`)).map((r) => [r.number, r.status]));
        expect(status).toEqual({ 104: 'AVAILABLE', 108: 'OCCUPIED' });
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
        const arrivals = await request(app).get(`/reservations?from=${hoje}&to=${hoje}&status=PENDING,CONFIRMED&page=1&limit=100`).set(auth);
        expect(arrivals.status).toBe(200);
        expect(arrivals.body.data.filter((r) => r.check_in_date === hoje)).toHaveLength(2);

        const inHouse = await request(app).get('/reservations?status=CHECKED_IN&page=1&limit=100').set(auth);
        expect(inHouse.body.data).toHaveLength(4);
        expect(inHouse.body.data.every((r) => r.room.status === 'OCCUPIED')).toBe(true);
    });

    it('a recepção faz o check-in da chegada com sinal e libera o quarto em limpeza', async () => {
        const arrivals = (await request(app).get(`/reservations?from=${hoje}&to=${hoje}&status=CONFIRMED&page=1&limit=100`).set(auth)).body.data;
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

// Achados do qa-redteam de 15/11 (docs/qa/redteam_m8-seed-datas-do-dia_15nov2026.md): o seed
// rodado por cima de um banco que já passou por demonstração ou ensaio.
describe('seed do dia — banco já usado na demonstração (qa-redteam de 15/11)', () => {
    const aurora = `(SELECT id FROM tenants WHERE subdomain = 'aurora')`;
    const quarto = (n) => `(SELECT id FROM rooms WHERE tenant_id = ${aurora} AND number = '${n}')`;

    it('🟡-1 quarto do cenário vendido na demo: pula a linha com aviso, sem abortar o seed', async () => {
        await truncateAll();
        await runSeed('2026-12-10 15:00-03');
        // A demo vendeu o 201 de 12 a 13/12; no dia 11 o cenário quer o 201 de 11 a 13.
        await sequelize.query(`
            INSERT INTO reservations (id, tenant_id, guest_id, room_id, user_id, check_in_date, check_out_date,
                                      status, total_amount, created_at, updated_at)
            SELECT gen_random_uuid(), ${aurora}, g.id, ${quarto('201')}, u.id, '2026-12-12', '2026-12-13',
                   'CONFIRMED', 350, now(), now()
              FROM guests g, users u
             WHERE g.cpf = '30000000030' AND u.email = 'admin@aurora.example'`);
        const antes = await counts();
        await expect(runSeed('2026-12-11 15:00-03')).resolves.not.toThrow();
        expect(await counts()).toEqual(antes);
        // O resto do cenário foi para o novo dia; o 201 do cenário ficou onde estava.
        const sc = await scenario('aurora', '2026-12-11', '2026-12-11 15:00-03');
        expect({ inHouse: sc.inHouse, departures: sc.departures, noShow: sc.noShow }).toEqual({ inHouse: 4, departures: 1, noShow: 1 });
        const r201 = await one(`SELECT r.check_in_date::text AS ci FROM reservations r
            JOIN guests g ON g.id = r.guest_id AND g.cpf = '30000000022'`);
        expect(r201).toEqual({ ci: '2026-12-10' });
    });

    it('🟡-2 walk-in no 106 depois da saída antecipada não recebe os consumos do seed', async () => {
        await truncateAll();
        await runSeed('2026-12-10 15:00-03');
        // O hóspede do cenário saiu antes; um walk-in entrou no 106 com a conta da suíte aberta.
        await sequelize.query(`
            UPDATE accounts SET status = 'CLOSED', closed_at = now()
             WHERE reservation_id = (SELECT r.id FROM reservations r JOIN guests g ON g.id = r.guest_id
                                      WHERE g.cpf = '30000000006');
            UPDATE reservations SET status = 'CHECKED_OUT', check_out_date = '2026-12-10'
             WHERE guest_id = (SELECT id FROM guests WHERE cpf = '30000000006');
            INSERT INTO reservations (id, tenant_id, guest_id, room_id, user_id, check_in_date, check_out_date,
                                      status, total_amount, created_at, updated_at)
            SELECT gen_random_uuid(), ${aurora}, g.id, ${quarto('106')}, u.id, '2026-12-10', '2026-12-12',
                   'CHECKED_IN', 300, now(), now()
              FROM guests g, users u WHERE g.cpf = '30000000031' AND u.email = 'admin@aurora.example';
            INSERT INTO accounts (id, tenant_id, type, status, reservation_id, room_id, guest_id, label,
                                  charges_lodging, opened_at, created_at, updated_at)
            SELECT gen_random_uuid(), r.tenant_id, 'ROOM', 'OPEN', r.id, r.room_id, r.guest_id, 'Suíte 106',
                   true, '2026-12-10 16:00-03', now(), now()
              FROM reservations r JOIN guests g ON g.id = r.guest_id AND g.cpf = '30000000031';`);
        await runSeed('2026-12-10 18:00-03');
        const { n } = await one(`SELECT COUNT(*)::int AS n FROM account_items ai
            JOIN accounts a ON a.id = ai.account_id
            JOIN reservations r ON r.id = a.reservation_id
            JOIN guests g ON g.id = r.guest_id AND g.cpf = '30000000031'`);
        expect(n).toBe(0);
    });

    it('🟡-5 o sinal da chegada é DEPOSIT; o pagamento do check-out é FULL', async () => {
        await truncateAll();
        await runSeed('2026-12-10 15:00-03');
        const rows = await q(`SELECT r.status, p.kind FROM payments p JOIN reservations r ON r.id = p.reservation_id
            JOIN guests g ON g.id = r.guest_id
            WHERE g.cpf IN ('30000000022', '30000000024', '40000000014', '40000000015') ORDER BY g.cpf`);
        expect(rows).toEqual([
            { status: 'CONFIRMED', kind: 'DEPOSIT' }, { status: 'CHECKED_OUT', kind: 'FULL' },
            { status: 'CONFIRMED', kind: 'DEPOSIT' }, { status: 'CHECKED_OUT', kind: 'FULL' }
        ]);
    });

    it('🟢 quarto em manutenção não vira limpeza, e mesa aberta na demo não muda de horário', async () => {
        await truncateAll();
        await runSeed('2026-12-10 15:00-03');
        await sequelize.query(`
            UPDATE rooms SET status = 'MAINTENANCE' WHERE id = ${quarto('105')};
            INSERT INTO accounts (id, tenant_id, type, status, label, charges_lodging, opened_at, created_at, updated_at)
            VALUES (gen_random_uuid(), ${aurora}, 'TABLE', 'OPEN', 'Mesa 7', false, '2026-12-07 20:00-03', now(), now());`);
        await runSeed('2026-12-12 15:00-03');
        expect((await one(`SELECT status FROM rooms WHERE id = ${quarto('105')}`)).status).toBe('MAINTENANCE');
        const mesa = await one(`SELECT to_char(opened_at AT TIME ZONE '${TZ}', 'YYYY-MM-DD HH24:MI') AS o FROM accounts WHERE label = 'Mesa 7'`);
        expect(mesa.o).toBe('2026-12-07 20:00');
    });

    it('as reservas novas do cenário nascem antes do próprio sinal e da própria entrada', async () => {
        await truncateAll();
        // Dia no passado: com o now() real, uma reserva criada "agora" nasceria depois da entrada.
        await runSeed('2026-11-01 15:00-03');
        const { n } = await one(`SELECT COUNT(*)::int AS n FROM reservations r
            JOIN guests g ON g.id = r.guest_id AND g.cpf IN ('30000000022','30000000023','30000000024','40000000014','40000000015')
            WHERE r.created_at > (r.check_in_date + time '00:00') AT TIME ZONE '${TZ}'
               OR EXISTS (SELECT 1 FROM payments p WHERE p.reservation_id = r.id AND p.paid_at < r.created_at)`);
        expect(n).toBe(0);
    });
});

// qa-explorador de 15/11 (docs/qa/exploratorio_m8-seed-painel-hoje_15nov2026.md).
describe('seed do dia — o roteiro da banca (qa-explorador de 15/11)', () => {
    beforeAll(async () => {
        await truncateAll();
        await runSeed('2026-12-10 15:00-03');
    });

    it('🟡 a saída do dia tem saldo a pagar: o passo 5 do roteiro registra pagamento no check-out', async () => {
        const r = await one(`SELECT r.total_amount::numeric AS total,
                                    COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'PAID'), 0)::numeric AS pago,
                                    MIN(p.kind) AS kind
                               FROM reservations r JOIN guests g ON g.id = r.guest_id AND g.cpf = '30000000007'
                               LEFT JOIN payments p ON p.reservation_id = r.id
                              GROUP BY r.total_amount`);
        expect({ total: Number(r.total), pago: Number(r.pago), kind: r.kind }).toEqual({ total: 450, pago: 150, kind: 'DEPOSIT' });
    });

    it('🟢 pagamento novo do seed usa um meio de pagamento atual (CARTAO_CREDITO, não o CARTAO antigo)', async () => {
        const { n } = await one(`SELECT COUNT(*)::int AS n FROM payments p JOIN reservations r ON r.id = p.reservation_id
            JOIN guests g ON g.id = r.guest_id
            WHERE g.cpf IN ('30000000022','30000000024','40000000014','40000000015') AND p.method = 'CARTAO'`);
        expect(n).toBe(0);
    });
});
