import { QueryTypes } from 'sequelize';
import sequelize from '../../database/connections/sequelize.js';
import { PermanentEventError } from './catalog.js';

/**
 * Aplica um evento validado (catalog.js → parseEvent) às projeções — catálogo v1.0 §5.1 e §5.2.
 *
 * Uma transação por evento, com as DUAS barreiras de idempotência (CA-01.4.h):
 *   1. `processed_events`: `INSERT ... ON CONFLICT DO NOTHING` que não insere nada = já visto.
 *   2. `aggregate_version`: o upsert só altera a linha se a versão do evento for MAIOR que a
 *      aplicada. Como o evento leva o estado inteiro (§1), a versão nova já contém o que a antiga
 *      mudaria — chegar fora de ordem não perde nada.
 *
 * Devolve 'applied' | 'duplicate' | 'stale'. Quem dá o ack é o consumidor, DEPOIS do commit.
 */

const GUEST_ERASED_NAME = 'Hóspede eliminado';

// Tabela e colunas por agregado — allowlist fixa (vão interpoladas no SQL; nada vem do evento).
const PROJECOES = {
    tenant:        { tabela: 'proj_tenants',         colunas: ['status'] },
    room_category: { tabela: 'proj_room_categories', colunas: ['name'] },
    room:          { tabela: 'proj_rooms',           colunas: ['category_id', 'number', 'status', 'cleaning_since'] },
    guest:         { tabela: 'proj_guests',          colunas: ['full_name'] },
    reservation:   { tabela: 'proj_reservations',    colunas: ['guest_id', 'room_id', 'status', 'check_in_date', 'check_out_date', 'total_amount', 'created_at'] },
    payment:       { tabela: 'proj_payments',        colunas: ['reservation_id', 'amount', 'method', 'status', 'paid_at'] }
};

// "Em limpeza desde" (§4.3): o instante do evento que LEVOU o quarto a CLEANING. Outro evento com o
// quarto ainda em limpeza (ex.: renomear) mantém o instante; saiu de CLEANING, zera.
const SET_ESPECIAL = {
    cleaning_since: `CASE WHEN EXCLUDED.status <> 'CLEANING' THEN NULL
                          WHEN p.status = 'CLEANING' THEN p.cleaning_since
                          ELSE EXCLUDED.cleaning_since END`
};

/** Valores das colunas da projeção a partir do evento. */
function valoresDe(event) {
    if (event.aggregate === 'guest' && event.fact === 'erased') {
        // Minimização (§4.4, CA-06.11.d): o nome sai, o id fica — as reservas históricas seguem somando.
        return { full_name: GUEST_ERASED_NAME };
    }
    if (event.aggregate === 'room') {
        return { ...event.data, cleaning_since: event.data.status === 'CLEANING' ? event.occurredAt : null };
    }
    return event.data;
}

async function upsertProjection(event, transaction) {
    const { tabela, colunas } = PROJECOES[event.aggregate];
    const valores = valoresDe(event);
    const todas = ['id', 'tenant_id', ...colunas, 'aggregate_version', 'deleted_at'];
    const sets = colunas.map((c) => `${c} = ${SET_ESPECIAL[c] ?? `EXCLUDED.${c}`}`);

    // Marca de exclusão "pegajosa": `*.deleted` grava; nenhum outro fato a apaga (§5.2 — um
    // `*.updated` não ressuscita o registro; restauração não existe no catálogo v1.0).
    const replacements = {
        ...valores,
        id: event.aggregateId,
        tenant_id: event.tenantId,
        aggregate_version: event.aggregateVersion,
        deleted_at: event.fact === 'deleted' ? event.occurredAt : null
    };

    const linhas = await sequelize.query(`
        INSERT INTO ${tabela} AS p (${todas.join(', ')})
        VALUES (${todas.map((c) => `:${c}`).join(', ')})
        ON CONFLICT (id) DO UPDATE SET
            ${sets.join(',\n            ')},
            aggregate_version = EXCLUDED.aggregate_version,
            deleted_at = COALESCE(p.deleted_at, EXCLUDED.deleted_at)
        WHERE p.aggregate_version < EXCLUDED.aggregate_version
          AND p.tenant_id = EXCLUDED.tenant_id
        RETURNING id
    `, { replacements, type: QueryTypes.SELECT, transaction });

    if (linhas.length > 0) return 'applied';

    // Nada mudou: versão antiga (descarte normal) ou o id já pertence a OUTRO hotel. O segundo caso
    // nunca acontece com o core (UUID gerado lá) — se acontecer, é evento forjado ou corrompido, e
    // sobrescrever cruzaria dados entre hotéis (CA-01.4.m). Erro permanente, não descarte silencioso.
    const [existente] = await sequelize.query(
        `SELECT tenant_id FROM ${tabela} WHERE id = :id`,
        { replacements: { id: event.aggregateId }, type: QueryTypes.SELECT, transaction }
    );
    if (existente && existente.tenant_id !== event.tenantId) {
        throw new PermanentEventError(`${event.aggregate} ${event.aggregateId} pertence a outro tenant`);
    }
    return 'stale';
}

export default async function applyEvent(event) {
    return sequelize.transaction(async (transaction) => {
        const novo = await sequelize.query(
            'INSERT INTO processed_events (event_id, processed_at) VALUES (:eventId, now()) ON CONFLICT DO NOTHING RETURNING event_id',
            { replacements: { eventId: event.eventId }, type: QueryTypes.SELECT, transaction }
        );
        if (novo.length === 0) return 'duplicate';
        return upsertProjection(event, transaction);
    });
}
