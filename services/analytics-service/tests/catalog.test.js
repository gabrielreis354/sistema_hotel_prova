import { describe, it, expect } from 'vitest';
import { randomUUID } from 'crypto';
import { parseEvent, PermanentEventError, EVENT_TYPES } from '../app/events/catalog.js';
import { envelope, toBuffer } from './helpers/events.js';

// Contrato do catálogo de eventos v1.0 — envelope (§2), payload (§4) e o que é erro PERMANENTE (§5.3).

const tenantId = randomUUID();
const reserva = (payload = {}) => envelope('reservation.created', {
    tenantId,
    payload: {
        guest_id: randomUUID(), room_id: randomUUID(), status: 'PENDING',
        check_in_date: '2027-03-01', check_out_date: '2027-03-05', total_amount: '1250.00',
        created_at: '2026-10-21T12:00:00.000Z', ...payload
    }
});
const permanente = (conteudo, mensagem) => {
    const corpo = Buffer.isBuffer(conteudo) ? conteudo : toBuffer(conteudo);
    expect(() => parseEvent(corpo)).toThrow(PermanentEventError);
    if (mensagem) expect(() => parseEvent(corpo)).toThrow(mensagem);
};

describe('Envelope válido (§2)', () => {
    it('devolve o evento normalizado com o payload do §4', () => {
        const env = reserva();
        const evento = parseEvent(toBuffer(env));
        expect(evento).toMatchObject({
            eventId: env.event_id, type: 'reservation.created', aggregate: 'reservation', fact: 'created',
            tenantId, aggregateId: env.aggregate_id, aggregateVersion: env.aggregate_version
        });
        expect(evento.data.total_amount).toBe('1250.00');   // dinheiro continua string
    });

    it('cobre os 20 tipos do catálogo (§4) e nenhum outro', () => {
        expect(EVENT_TYPES).toHaveLength(20);
        expect(EVENT_TYPES).toContain('guest.erased');
        expect(EVENT_TYPES).not.toContain('tenant.deleted');
    });

    it('ignora campo de payload que não conhece (§7: mudança compatível) e não projeta previous_status', () => {
        const evento = parseEvent(toBuffer(reserva({ source: 'DIRECT', previous_status: 'PENDING' })));
        expect(evento.data).not.toHaveProperty('source');
        expect(evento.data).not.toHaveProperty('previous_status');
    });

    it('guest.erased com payload vazio é válido e não carrega nome', () => {
        const evento = parseEvent(toBuffer(envelope('guest.erased', { tenantId, payload: {} })));
        expect(evento.data).toEqual({});
    });

    it('pagamento sem reserva (conta de day-use/mesa, T-04.4) aceita reservation_id nulo', () => {
        const evento = parseEvent(toBuffer(envelope('payment.created', {
            tenantId, payload: { reservation_id: null, amount: '45.90', method: 'DINHEIRO', status: 'PAID', paid_at: '2026-10-21T12:00:00.000Z' }
        })));
        expect(evento.data.reservation_id).toBeNull();
    });
});

describe('Erro permanente (§5.3) — direto para a DLQ', () => {
    it('JSON inválido', () => permanente(Buffer.from('{nao é json'), 'JSON inválido'));
    it('envelope que não é objeto', () => permanente(Buffer.from('[1,2]')));
    it('tenant_id ausente', () => { const e = reserva(); delete e.tenant_id; permanente(e, 'tenant_id ausente'); });
    it('type desconhecido', () => permanente({ ...reserva(), type: 'reservation.exploded' }, 'type desconhecido'));
    it('version maior que a suportada', () => permanente({ ...reserva(), version: 2 }, 'maior que a suportada'));
    it('version inválida', () => permanente({ ...reserva(), version: '1' }));
    it('event_id que não é UUID', () => permanente({ ...reserva(), event_id: 'abc' }));
    it('aggregate_version ausente ou não inteiro', () => {
        permanente({ ...reserva(), aggregate_version: undefined });
        permanente({ ...reserva(), aggregate_version: 1.5 });
    });
    it('occurred_at fora do ISO-8601 UTC', () => permanente({ ...reserva(), occurred_at: '21/10/2026' }));
    it('payload ausente', () => permanente({ ...reserva(), payload: null }));
    it('campo do payload ausente', () => {
        const e = reserva(); delete e.payload.total_amount; permanente(e, 'payload.total_amount');
    });
    it('dinheiro como número (float) e não como string decimal', () => permanente(reserva({ total_amount: 1250.5 }), 'payload.total_amount'));
    it('dinheiro sem as duas casas', () => permanente(reserva({ total_amount: '1250.5' })));
    it('status fora da allowlist', () => permanente(reserva({ status: 'NO_SHOW' }), 'payload.status'));
    it('data inválida', () => permanente(reserva({ check_in_date: '2027-13-45' })));
    it('tenant.* com aggregate_id de outro hotel', () => {
        permanente(envelope('tenant.updated', { tenantId, aggregateId: randomUUID(), payload: { status: 'ACTIVE' } }), 'difere de tenant_id');
    });
    it('a mensagem de erro cita o campo, nunca o valor (LGPD — vai para log e cabeçalho da DLQ)', () => {
        const e = envelope('guest.created', { tenantId, payload: { full_name: 98765 } });
        expect(() => parseEvent(toBuffer(e))).toThrow('campo payload.full_name: esperado texto');
        expect(() => parseEvent(toBuffer(e))).not.toThrow(/98765/);
    });

    it('🟡-4: texto em branco que o core gravou é ACEITO (o catálogo tipa como string) — não vai para a DLQ', () => {
        for (const nome of ['', '   ']) {
            const evento = parseEvent(toBuffer(envelope('guest.updated', { tenantId, payload: { full_name: nome } })));
            expect(evento.data.full_name).toBe(nome);
        }
        expect(() => parseEvent(toBuffer(envelope('guest.updated', { tenantId, payload: { full_name: null } })))).toThrow(PermanentEventError);
    });
});
