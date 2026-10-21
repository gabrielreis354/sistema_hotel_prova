import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'crypto';
import { QueryTypes } from 'sequelize';
import sequelize from '../database/connections/sequelize.js';
import { parseEvent, PermanentEventError } from '../app/events/catalog.js';
import applyEvent from '../app/events/applyEvent.js';
import { GuestProjection, ReservationProjection, RoomProjection, PaymentProjection } from '../app/Models/index.js';
import { envelope, toBuffer, truncateAll, proximaVersao } from './helpers/events.js';

// Projeções e idempotência — catálogo v1.0 §4 e §5.2 (CA-01.4.h, CA-01.4.l, CA-01.4.m).

const aplicar = (env) => applyEvent(parseEvent(toBuffer(env)));
const contarProcessados = async () => (await sequelize.query('SELECT count(*)::int AS n FROM processed_events', { type: QueryTypes.SELECT }))[0].n;

let tenantA;
let tenantB;
beforeEach(async () => {
    await truncateAll();
    tenantA = randomUUID();
    tenantB = randomUUID();
});

const reservaPayload = (extra = {}) => ({
    guest_id: randomUUID(), room_id: randomUUID(), status: 'CONFIRMED',
    check_in_date: '2027-03-01', check_out_date: '2027-03-05', total_amount: '1250.10',
    created_at: '2026-10-20T10:00:00.000Z', ...extra
});

describe('CA-01.4.h — evento repetido não altera nenhum indicador', () => {
    it('o MESMO evento (mesmo event_id) duas vezes: a segunda é "duplicate" e nada muda', async () => {
        const env = envelope('reservation.created', { tenantId: tenantA, payload: reservaPayload() });
        expect(await aplicar(env)).toBe('applied');
        const antes = (await ReservationProjection.findOne({ where: { id: env.aggregate_id, tenant_id: tenantA } })).toJSON();

        expect(await aplicar(env)).toBe('duplicate');
        const depois = (await ReservationProjection.findOne({ where: { id: env.aggregate_id, tenant_id: tenantA } })).toJSON();
        expect(depois).toEqual(antes);
        expect(await ReservationProjection.count({ where: { tenant_id: tenantA } })).toBe(1);
        expect(await contarProcessados()).toBe(1);
    });

    it('versão antiga depois da nova (nova tentativa fora de ordem) é ignorada', async () => {
        const id = randomUUID();
        const v5 = envelope('reservation.created', { tenantId: tenantA, aggregateId: id, aggregateVersion: 5, payload: reservaPayload({ status: 'PENDING' }) });
        const v7 = envelope('reservation.status_changed', { tenantId: tenantA, aggregateId: id, aggregateVersion: 7, payload: reservaPayload({ status: 'CONFIRMED', previous_status: 'PENDING' }) });

        expect(await aplicar(v7)).toBe('applied');
        expect(await aplicar(v5)).toBe('stale');
        const r = await ReservationProjection.findOne({ where: { id, tenant_id: tenantA } });
        expect(r.status).toBe('CONFIRMED');
        expect(Number(r.aggregate_version)).toBe(7);
    });

    it('mesma versão com outro event_id (republicação) também é ignorada', async () => {
        const id = randomUUID();
        await aplicar(envelope('guest.created', { tenantId: tenantA, aggregateId: id, aggregateVersion: 10, payload: { full_name: 'Ana' } }));
        expect(await aplicar(envelope('guest.updated', { tenantId: tenantA, aggregateId: id, aggregateVersion: 10, payload: { full_name: 'Outra' } }))).toBe('stale');
        expect((await GuestProjection.findOne({ where: { id, tenant_id: tenantA } })).full_name).toBe('Ana');
    });

    it('carga inicial rodada duas vezes (CA-01.4.j): *.updated com o mesmo retrato e versão maior não muda o estado', async () => {
        const id = randomUUID();
        const payload = reservaPayload();
        await aplicar(envelope('reservation.created', { tenantId: tenantA, aggregateId: id, payload }));
        const antes = (await ReservationProjection.findOne({ where: { id, tenant_id: tenantA } })).toJSON();

        for (let i = 0; i < 2; i++) {
            expect(await aplicar(envelope('reservation.updated', { tenantId: tenantA, aggregateId: id, payload }))).toBe('applied');
        }
        const depois = (await ReservationProjection.findOne({ where: { id, tenant_id: tenantA } })).toJSON();
        const { aggregate_version: va, ...estadoAntes } = antes;
        const { aggregate_version: vd, ...estadoDepois } = depois;
        expect(estadoDepois).toEqual(estadoAntes);
        expect(Number(vd)).toBeGreaterThan(Number(va));
    });

    it('*.updated de registro que a projeção ainda não tem cria a linha (carga inicial, ordem entre agregados)', async () => {
        const id = randomUUID();
        expect(await aplicar(envelope('room.updated', { tenantId: tenantA, aggregateId: id, payload: { category_id: randomUUID(), number: '12', status: 'AVAILABLE' } }))).toBe('applied');
        expect(await RoomProjection.count({ where: { id, tenant_id: tenantA } })).toBe(1);
    });

    it('falha no meio da transação desfaz também o processed_events — o evento é reprocessado depois', async () => {
        const env = envelope('reservation.created', { tenantId: tenantA, payload: reservaPayload() });
        const evento = parseEvent(toBuffer(env));
        evento.data.total_amount = '99999999999999.99';   // estoura NUMERIC(12,2): erro do banco no upsert
        await expect(applyEvent(evento)).rejects.toThrow();
        expect(await contarProcessados()).toBe(0);
        expect(await aplicar(env)).toBe('applied');
    });
});

describe('*.deleted é marca de exclusão, não remoção (§5.2)', () => {
    it('marca deleted_at com o occurred_at, mantém o retrato, e um *.updated atrasado não ressuscita', async () => {
        const id = randomUUID();
        await aplicar(envelope('guest.created', { tenantId: tenantA, aggregateId: id, aggregateVersion: 1, payload: { full_name: 'Bruno' } }));
        const quando = '2026-10-21T15:00:00.000Z';
        await aplicar(envelope('guest.deleted', { tenantId: tenantA, aggregateId: id, aggregateVersion: 3, occurredAt: quando, payload: { full_name: 'Bruno' } }));
        expect(await aplicar(envelope('guest.updated', { tenantId: tenantA, aggregateId: id, aggregateVersion: 2, payload: { full_name: 'Bruno Atrasado' } }))).toBe('stale');

        const g = await GuestProjection.findOne({ where: { id, tenant_id: tenantA } });
        expect(g.full_name).toBe('Bruno');
        expect(g.deleted_at.toISOString()).toBe(quando);
    });

    it('evento posterior à exclusão não apaga a marca', async () => {
        const id = randomUUID();
        const pagamento = { reservation_id: randomUUID(), amount: '100.00', method: 'PIX', status: 'PAID', paid_at: '2026-10-21T10:00:00.000Z' };
        await aplicar(envelope('payment.deleted', { tenantId: tenantA, aggregateId: id, aggregateVersion: 4, payload: pagamento }));
        await aplicar(envelope('payment.updated', { tenantId: tenantA, aggregateId: id, aggregateVersion: 9, payload: { ...pagamento, method: 'CARTAO' } }));
        const p = await PaymentProjection.findOne({ where: { id, tenant_id: tenantA } });
        expect(p.method).toBe('CARTAO');
        expect(p.deleted_at).not.toBeNull();
    });
});

describe('CA-01.4.l — hóspede: só id, tenant_id e nome', () => {
    it('a tabela proj_guests não tem coluna para CPF, e-mail ou telefone', async () => {
        const colunas = await sequelize.query(
            `SELECT column_name FROM information_schema.columns WHERE table_name = 'proj_guests' ORDER BY column_name`,
            { type: QueryTypes.SELECT }
        );
        expect(colunas.map((c) => c.column_name)).toEqual(['aggregate_version', 'deleted_at', 'full_name', 'id', 'tenant_id']);
    });

    it('campo pessoal extra no payload é descartado, não gravado', async () => {
        const id = randomUUID();
        await aplicar(envelope('guest.created', { tenantId: tenantA, aggregateId: id, payload: { full_name: 'Carla', email: 'c@x.com', cpf: '12345678909', phone: '11999990000' } }));
        const [linha] = await sequelize.query('SELECT * FROM proj_guests WHERE id = :id', { replacements: { id }, type: QueryTypes.SELECT });
        expect(Object.keys(linha).sort()).toEqual(['aggregate_version', 'deleted_at', 'full_name', 'id', 'tenant_id']);
        expect(JSON.stringify(linha)).not.toMatch(/c@x\.com|12345678909|11999990000/);
    });

    it('guest.erased troca o nome por "Hóspede eliminado" e mantém o id (CA-06.11.d)', async () => {
        const id = randomUUID();
        await aplicar(envelope('guest.created', { tenantId: tenantA, aggregateId: id, aggregateVersion: 1, payload: { full_name: 'Daniel Titular' } }));
        await aplicar(envelope('guest.erased', { tenantId: tenantA, aggregateId: id, aggregateVersion: 2, payload: {} }));
        // Evento antigo com o nome, chegando depois da eliminação, não traz o nome de volta.
        expect(await aplicar(envelope('guest.updated', { tenantId: tenantA, aggregateId: id, aggregateVersion: 1, payload: { full_name: 'Daniel Titular' } }))).not.toBe('applied');

        const g = await GuestProjection.findOne({ where: { id, tenant_id: tenantA } });
        expect(g.full_name).toBe('Hóspede eliminado');
        const [{ achou }] = await sequelize.query(
            `SELECT count(*)::int AS achou FROM proj_guests WHERE full_name LIKE '%Daniel%'`, { type: QueryTypes.SELECT });
        expect(achou).toBe(0);
    });
});

describe('Quartos — "em limpeza desde" (§4.3)', () => {
    it('é o instante do evento que LEVOU o quarto a CLEANING; renomear em limpeza mantém; sair de CLEANING zera', async () => {
        const id = randomUUID();
        const categoria = randomUUID();
        const quarto = (status, number = '101') => ({ category_id: categoria, number, status });
        await aplicar(envelope('room.created', { tenantId: tenantA, aggregateId: id, aggregateVersion: proximaVersao(), payload: quarto('OCCUPIED') }));
        await aplicar(envelope('room.updated', { tenantId: tenantA, aggregateId: id, aggregateVersion: proximaVersao(), occurredAt: '2026-10-21T11:00:00.000Z', payload: quarto('CLEANING') }));
        await aplicar(envelope('room.updated', { tenantId: tenantA, aggregateId: id, aggregateVersion: proximaVersao(), occurredAt: '2026-10-21T11:30:00.000Z', payload: quarto('CLEANING', '101A') }));

        let r = await RoomProjection.findOne({ where: { id, tenant_id: tenantA } });
        expect(r.number).toBe('101A');
        expect(r.cleaning_since.toISOString()).toBe('2026-10-21T11:00:00.000Z');

        await aplicar(envelope('room.updated', { tenantId: tenantA, aggregateId: id, aggregateVersion: proximaVersao(), payload: quarto('AVAILABLE', '101A') }));
        r = await RoomProjection.findOne({ where: { id, tenant_id: tenantA } });
        expect(r.cleaning_since).toBeNull();
    });
});

describe('Dinheiro em NUMERIC, sem float (catálogo §2 e §9.1)', () => {
    it('o valor volta exatamente como string e a soma no banco é exata', async () => {
        for (const valor of ['0.10', '0.20']) {
            await aplicar(envelope('reservation.created', { tenantId: tenantA, payload: reservaPayload({ total_amount: valor }) }));
        }
        const r = await ReservationProjection.findOne({ where: { tenant_id: tenantA, total_amount: '0.10' } });
        expect(r.total_amount).toBe('0.10');
        const [{ soma }] = await sequelize.query(
            'SELECT SUM(total_amount)::text AS soma FROM proj_reservations WHERE tenant_id = :tenantA', { replacements: { tenantA }, type: QueryTypes.SELECT });
        expect(soma).toBe('0.30');   // em float seria 0.30000000000000004
    });
});

describe('CA-01.4.m — isolamento entre hotéis na projeção', () => {
    it('evento de outro hotel com o id de um registro existente é erro permanente e não sobrescreve', async () => {
        const id = randomUUID();
        await aplicar(envelope('guest.created', { tenantId: tenantA, aggregateId: id, aggregateVersion: 1, payload: { full_name: 'Do Hotel A' } }));
        await expect(aplicar(envelope('guest.updated', { tenantId: tenantB, aggregateId: id, aggregateVersion: 2, payload: { full_name: 'Invasor' } })))
            .rejects.toBeInstanceOf(PermanentEventError);

        const g = await GuestProjection.findOne({ where: { id, tenant_id: tenantA } });
        expect(g.full_name).toBe('Do Hotel A');
        expect(await GuestProjection.count({ where: { tenant_id: tenantB } })).toBe(0);
        expect(await contarProcessados()).toBe(1);   // o evento rejeitado não fica como "processado"
    });
});
