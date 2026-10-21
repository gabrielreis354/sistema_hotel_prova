/**
 * Contrato dos eventos do core — catálogo de eventos v1.0 (docs/specs/anexos/SPEC-01-catalogo-eventos.md).
 *
 * Tudo aqui é ALLOWLIST: tipo, versão, status e formato de cada campo. O que não está listado é erro
 * PERMANENTE (§5.3) — vai direto para a fila de mensagens mortas, porque tentar de novo não muda o
 * resultado. Campo de payload que o catálogo não define é ignorado (§7: mudança compatível).
 */

/** Evento que nunca vai poder ser aplicado como está: JSON inválido, campo ausente, tipo desconhecido. */
export class PermanentEventError extends Error {
    constructor(message) {
        super(message);
        this.name = 'PermanentEventError';
    }
}

/** Versão do esquema do payload que este consumidor entende (§2, §7). */
export const SUPPORTED_VERSION = 1;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MONEY = /^-?\d{1,10}\.\d{2}$/;                                // DECIMAL como string, duas casas (§2)
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/; // ISO-8601 UTC (§2)

const erro = (campo, esperado) => new PermanentEventError(`campo ${campo}: esperado ${esperado}`);

// Validadores: devolvem o valor normalizado ou lançam PermanentEventError. A mensagem cita o campo,
// nunca o valor — o valor pode ser o nome do hóspede, e a mensagem vai para log e cabeçalho da DLQ.
const uuid = (campo, v) => { if (typeof v !== 'string' || !UUID.test(v)) throw erro(campo, 'UUID'); return v.toLowerCase(); };
const uuidOuNulo = (campo, v) => (v === null ? null : uuid(campo, v));
const texto = (campo, v) => { if (typeof v !== 'string' || v.trim() === '') throw erro(campo, 'texto não vazio'); return v; };
const dinheiro = (campo, v) => { if (typeof v !== 'string' || !MONEY.test(v)) throw erro(campo, 'decimal em string com duas casas'); return v; };
const data = (campo, v) => {
    if (typeof v !== 'string' || !DATE.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`))) throw erro(campo, 'data YYYY-MM-DD');
    return v;
};
const instante = (campo, v) => {
    if (typeof v !== 'string' || !INSTANT.test(v) || Number.isNaN(Date.parse(v))) throw erro(campo, 'instante ISO-8601 UTC');
    return v;
};
const instanteOuNulo = (campo, v) => (v === null ? null : instante(campo, v));
const umDe = (...valores) => (campo, v) => { if (!valores.includes(v)) throw erro(campo, valores.join('|')); return v; };

/**
 * Payload de cada agregado (§4): campo → validador. Só o que as 7 consultas usam.
 * `previous_status` de `*.status_changed` não é projetado (§4.5) — fica fora de propósito.
 */
const PAYLOADS = {
    tenant:        { status: umDe('ACTIVE', 'SUSPENDED') },
    room_category: { name: texto },
    room:          { category_id: uuid, number: texto, status: umDe('AVAILABLE', 'OCCUPIED', 'CLEANING', 'MAINTENANCE') },
    guest:         { full_name: texto },
    reservation: {
        guest_id: uuid,
        room_id: uuid,
        status: umDe('PENDING', 'CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED'),
        check_in_date: data,
        check_out_date: data,
        total_amount: dinheiro,
        created_at: instante
    },
    payment: {
        reservation_id: uuidOuNulo,
        amount: dinheiro,
        method: texto,
        status: umDe('PENDING', 'PAID', 'EXPIRED', 'FAILED', 'VOIDED'),
        paid_at: instanteOuNulo
    }
};

/** Fatos de cada agregado (§4). `type` = `<agregado>.<fato>`. */
const FATOS = {
    tenant:        ['created', 'updated'],
    room_category: ['created', 'updated', 'deleted'],
    room:          ['created', 'updated', 'deleted'],
    guest:         ['created', 'updated', 'deleted', 'erased'],
    reservation:   ['created', 'updated', 'status_changed', 'deleted'],
    payment:       ['created', 'updated', 'status_changed', 'deleted']
};

export const EVENT_TYPES = Object.entries(FATOS).flatMap(([agregado, fatos]) => fatos.map((f) => `${agregado}.${f}`));

function validarPayload(agregado, fato, payload) {
    // guest.erased tem payload VAZIO por definição (§4.4): o nome não viaja de novo.
    if (agregado === 'guest' && fato === 'erased') return {};
    const campos = {};
    for (const [campo, validar] of Object.entries(PAYLOADS[agregado])) {
        if (!Object.hasOwn(payload, campo)) throw erro(`payload.${campo}`, 'presente');
        campos[campo] = validar(`payload.${campo}`, payload[campo]);
    }
    return campos;
}

/**
 * Converte o corpo da mensagem AMQP no evento validado:
 * `{ eventId, type, aggregate, fact, occurredAt, tenantId, aggregateId, aggregateVersion, data }`.
 * Lança PermanentEventError para tudo o que o §5.3 chama de erro permanente.
 */
export function parseEvent(content) {
    let envelope;
    try {
        envelope = JSON.parse(Buffer.isBuffer(content) ? content.toString('utf8') : content);
    } catch {
        throw new PermanentEventError('JSON inválido');
    }
    if (envelope === null || typeof envelope !== 'object' || Array.isArray(envelope)) {
        throw new PermanentEventError('envelope não é um objeto');
    }

    if (!EVENT_TYPES.includes(envelope.type)) throw new PermanentEventError('type desconhecido');
    if (!Number.isInteger(envelope.version) || envelope.version < 1) throw erro('version', 'inteiro ≥ 1');
    if (envelope.version > SUPPORTED_VERSION) {
        throw new PermanentEventError(`version ${envelope.version} maior que a suportada (${SUPPORTED_VERSION})`);
    }
    if (envelope.tenant_id === undefined || envelope.tenant_id === null) throw new PermanentEventError('tenant_id ausente');

    const eventId = uuid('event_id', envelope.event_id);
    const tenantId = uuid('tenant_id', envelope.tenant_id);
    const aggregateId = uuid('aggregate_id', envelope.aggregate_id);
    const occurredAt = instante('occurred_at', envelope.occurred_at);
    if (!Number.isSafeInteger(envelope.aggregate_version) || envelope.aggregate_version < 1) {
        throw erro('aggregate_version', 'inteiro positivo');
    }
    const payload = envelope.payload;
    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) throw erro('payload', 'objeto');

    const [aggregate, fact] = envelope.type.split('.');
    // O hotel é o próprio escopo: um tenant.* de um hotel com o tenant_id de outro é evento forjado.
    if (aggregate === 'tenant' && aggregateId !== tenantId) throw new PermanentEventError('tenant.*: aggregate_id difere de tenant_id');

    return {
        eventId,
        type: envelope.type,
        aggregate,
        fact,
        occurredAt,
        tenantId,
        aggregateId,
        aggregateVersion: envelope.aggregate_version,
        data: validarPayload(aggregate, fact, payload)
    };
}
