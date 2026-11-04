import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import jwt from 'jsonwebtoken';
import sequelize from '../../database/connections/sequelize.js';

// Envelope exatamente no formato do catálogo v1.0 §2 — o mesmo que o publicador do core monta
// (services/core-service/app/services/outbox/publisher.js, toEnvelope).
let sequencia = 1000;
export function envelope(type, { tenantId, aggregateId = randomUUID(), version = 1, aggregateVersion = ++sequencia, payload = {}, occurredAt = new Date().toISOString() } = {}) {
    return {
        event_id: randomUUID(),
        type,
        version,
        occurred_at: occurredAt,
        tenant_id: tenantId,
        aggregate_id: aggregateId,
        aggregate_version: aggregateVersion,
        payload
    };
}

export const proximaVersao = () => ++sequencia;
export const toBuffer = (env) => Buffer.from(JSON.stringify(env));

export async function truncateAll() {
    await sequelize.query(`TRUNCATE TABLE proj_tenants, proj_room_categories, proj_rooms, proj_guests,
        proj_reservations, proj_payments, processed_events`);
}

/** Token como o core emite (LoginController): RS256, payload { userId, role, tenantId }. */
export function tokenFor({ tenantId, role = 'ADMIN', userId = randomUUID() }, opcoes = {}) {
    const privada = readFileSync(resolve(process.cwd(), process.env.TEST_JWT_PRIVATE_KEY_PATH), 'utf8');
    return jwt.sign({ userId, role, tenantId }, opcoes.key ?? privada, { algorithm: opcoes.algorithm ?? 'RS256', expiresIn: opcoes.expiresIn ?? '1h' });
}
