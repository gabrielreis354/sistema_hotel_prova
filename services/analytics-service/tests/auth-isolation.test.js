import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { randomUUID, generateKeyPairSync } from 'crypto';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import createApp from '../bootstrap/createApp.js';
import { parseEvent } from '../app/events/catalog.js';
import applyEvent from '../app/events/applyEvent.js';
import { assertPublicKey } from '../app/utils/jwtPublicKey.js';
import { envelope, toBuffer, truncateAll, tokenFor } from './helpers/events.js';

// CA-01.4.m — o analytics VERIFICA o JWT do core com a chave pública (RS256, ADR-006) e cada hotel
// só enxerga as próprias projeções. Rota usada: GET /analytics/health (saúde autenticada da H.2).

const app = createApp();
const aplicar = (env) => applyEvent(parseEvent(toBuffer(env)));
let hotelA;
let hotelB;
let suspenso;

async function semearHotel(tenantId, { status = 'ACTIVE', hospedes = 0, quartos = 0 } = {}) {
    await aplicar(envelope('tenant.created', { tenantId, aggregateId: tenantId, payload: { status } }));
    for (let i = 0; i < hospedes; i++) await aplicar(envelope('guest.created', { tenantId, payload: { full_name: `Hóspede ${i}` } }));
    for (let i = 0; i < quartos; i++) {
        await aplicar(envelope('room.created', { tenantId, payload: { category_id: randomUUID(), number: String(100 + i), status: 'AVAILABLE' } }));
    }
}

beforeAll(async () => {
    await truncateAll();
    [hotelA, hotelB, suspenso] = [randomUUID(), randomUUID(), randomUUID()];
    await semearHotel(hotelA, { hospedes: 2, quartos: 3 });
    await semearHotel(hotelB, { hospedes: 5, quartos: 1 });
    await semearHotel(suspenso, { status: 'SUSPENDED' });
    // Hóspede excluído do hotel A não conta como vivo.
    const id = randomUUID();
    await aplicar(envelope('guest.created', { tenantId: hotelA, aggregateId: id, payload: { full_name: 'Excluído' } }));
    await aplicar(envelope('guest.deleted', { tenantId: hotelA, aggregateId: id, payload: { full_name: 'Excluído' } }));
});

const saude = (token) => request(app).get('/analytics/health').set('Authorization', `Bearer ${token}`);

describe('Verificação do token RS256 com a chave pública', () => {
    it('/health (probe) responde sem token', async () => {
        const res = await request(app).get('/health');
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('OK');
    });

    it('sem token → 401', async () => {
        expect((await request(app).get('/analytics/health')).status).toBe(401);
    });

    it('token emitido pelo core (RS256) → 200', async () => {
        expect((await saude(tokenFor({ tenantId: hotelA }))).status).toBe(200);
    });

    it('token assinado com OUTRA chave → 401', async () => {
        const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
        expect((await saude(tokenFor({ tenantId: hotelA }, { key: privateKey }))).status).toBe(401);
    });

    it('HS256 assinado com a chave PÚBLICA (algorithm confusion) → 401', async () => {
        const publica = readFileSync(resolve(process.cwd(), process.env.JWT_PUBLIC_KEY_PATH), 'utf8');
        let token;
        try {
            token = tokenFor({ tenantId: hotelA }, { key: publica, algorithm: 'HS256' });
        } catch {
            // jsonwebtoken 9 já recusa assinar HS256 com PEM assimétrico — monta o token à mão.
            const { createHmac } = await import('crypto');
            const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
            const corpo = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ tenantId: hotelA, role: 'ADMIN', exp: Math.floor(Date.now() / 1000) + 3600 })}`;
            token = `${corpo}.${createHmac('sha256', publica).update(corpo).digest('base64url')}`;
        }
        expect((await saude(token)).status).toBe(401);
    });

    it('RS512 com a privada correta → 401 (o contrato é UM algoritmo)', async () => {
        expect((await saude(tokenFor({ tenantId: hotelA }, { algorithm: 'RS512' }))).status).toBe(401);
    });

    it('token expirado → 401', async () => {
        expect((await saude(tokenFor({ tenantId: hotelA }, { expiresIn: -10 }))).status).toBe(401);
    });

    it('a chave PRIVADA no lugar da pública é recusada no boot (o analytics nunca emite token)', () => {
        const privada = readFileSync(resolve(process.cwd(), process.env.TEST_JWT_PRIVATE_KEY_PATH), 'utf8');
        expect(() => assertPublicKey(privada)).toThrow(/PRIVADA/);
        expect(() => assertPublicKey('não é pem')).toThrow(/inválida/);
        const { publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256', publicKeyEncoding: { type: 'spki', format: 'pem' } });
        expect(() => assertPublicKey(publicKey)).toThrow(/não é RSA/);
    });
});

describe('Hotel e papel (allowlist)', () => {
    it('hotel SUSPENDED → 403', async () => {
        expect((await saude(tokenFor({ tenantId: suspenso }))).status).toBe(403);
    });

    it('hotel que não está na projeção → 401', async () => {
        expect((await saude(tokenFor({ tenantId: randomUUID() }))).status).toBe(401);
    });

    it('token sem tenantId, ou com tenantId que não é UUID → 401', async () => {
        expect((await saude(tokenFor({ tenantId: undefined }))).status).toBe(401);
        expect((await saude(tokenFor({ tenantId: "x' OR '1'='1" }))).status).toBe(401);
    });

    it('RECEPTIONIST passa; WAITER e papel desconhecido → 403', async () => {
        expect((await saude(tokenFor({ tenantId: hotelA, role: 'RECEPTIONIST' }))).status).toBe(200);
        expect((await saude(tokenFor({ tenantId: hotelA, role: 'WAITER' }))).status).toBe(403);
        expect((await saude(tokenFor({ tenantId: hotelA, role: 'SUPERADMIN' }))).status).toBe(403);
    });
});

describe('CA-01.4.m — isolamento: cada hotel só vê as próprias projeções', () => {
    it('hotel A vê só os seus registros vivos; hotel B, só os dele', async () => {
        const a = await saude(tokenFor({ tenantId: hotelA }));
        expect(a.body).toEqual({
            status: 'OK', tenant_id: hotelA,
            projections: { room_categories: 0, rooms: 3, guests: 2, reservations: 0, payments: 0 }
        });
        const b = await saude(tokenFor({ tenantId: hotelB }));
        expect(b.body.tenant_id).toBe(hotelB);
        expect(b.body.projections).toMatchObject({ rooms: 1, guests: 5 });
    });

    it('tenant na query string é ignorado — o escopo vem só do token', async () => {
        const res = await request(app).get(`/analytics/health?tenant_id=${hotelB}&tenantId=${hotelB}`)
            .set('Authorization', `Bearer ${tokenFor({ tenantId: hotelA })}`);
        expect(res.body.tenant_id).toBe(hotelA);
        expect(res.body.projections.guests).toBe(2);
    });
});
