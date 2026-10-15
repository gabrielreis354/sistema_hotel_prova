import { EventEmitter } from 'node:events';
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { QueryTypes } from 'sequelize';
import sequelize from '../database/connections/sequelize.js';
import { createApp } from './helpers/createApp.js';
import { truncateAll } from './helpers/db.js';
import { registerAndLogin } from './helpers/auth.js';
import { createGuest } from './helpers/factories.js';
import { createOutboxPublisher, EXCHANGE } from '../app/services/outbox/publisher.js';

// T-01.4 / H.1 — publicador do outbox (CA-01.4.b, c), contrato no catálogo v1.0 §5.4: lote com
// FOR UPDATE SKIP LOCKED, publisher confirms, published_at só depois da confirmação, espera
// crescente até 30 s com o broker fora. O RabbitMQ real não existe no CI: aqui o canal é falso e
// registra o que receberia. A ida ao broker real é verificada à parte, no compose.

const app = createApp();
let jwt;

// `semFila`: tipos de evento que o broker devolve (basic.return) por não haver fila ligada.
// `trava`: confirmação que nunca chega (alarme de memória/disco do RabbitMQ).
function canalFalso({ confirma = true, atrasoMs = 0, semFila = [], trava = false } = {}) {
    const canal = new EventEmitter();
    canal.publicados = [];
    canal.publish = (exchange, routingKey, content, options) => {
        canal.publicados.push({ exchange, routingKey, envelope: JSON.parse(content.toString()), options });
        if (options.mandatory && semFila.includes(routingKey)) {
            queueMicrotask(() => canal.emit('return', { fields: { routingKey }, properties: { messageId: options.messageId } }));
        }
        return true;
    };
    canal.waitForConfirms = async () => {
        if (trava) return new Promise(() => {});
        if (atrasoMs) await new Promise((ok) => setTimeout(ok, atrasoMs));
        if (!confirma) throw new Error('nack do broker');
    };
    return canal;
}

const pendentes = async () => (await sequelize.query('SELECT count(*)::int AS n FROM outbox WHERE published_at IS NULL', { type: QueryTypes.SELECT }))[0].n;

beforeAll(async () => {
    await truncateAll();
    ({ jwt } = await registerAndLogin(app, { tenantName: 'Hotel Publicador' }));
});

beforeEach(async () => {
    // Cada teste parte do outbox inteiro já publicado e cria os próprios eventos.
    await sequelize.query('UPDATE outbox SET published_at = now() WHERE published_at IS NULL');
});

describe('publishPending — entrega e confirmação (CA-01.4.b)', () => {
    it('publica na exchange do core, em ordem, com o envelope do §2 e marca published_at', async () => {
        const g = await createGuest(app, jwt, { full_name: 'Publicada Um' });
        await request(app).put(`/guests/${g.id}`).set({ Authorization: `Bearer ${jwt}` }).send({ full_name: 'Publicada Dois' });
        const canal = canalFalso();

        const n = await createOutboxPublisher().publishPending(canal);

        expect(n).toBe(2);
        expect(await pendentes()).toBe(0);
        const [criado, atualizado] = canal.publicados;
        expect(criado.exchange).toBe(EXCHANGE);
        expect(criado.routingKey).toBe('guest.created');
        expect(atualizado.routingKey).toBe('guest.updated');
        expect(criado.options).toMatchObject({ persistent: true, mandatory: true, contentType: 'application/json', messageId: criado.envelope.event_id, type: 'guest.created' });
        expect(Object.keys(criado.envelope).sort()).toEqual(['aggregate_id', 'aggregate_version', 'event_id', 'occurred_at', 'payload', 'tenant_id', 'type', 'version']);
        expect(criado.envelope).toMatchObject({ type: 'guest.created', version: 1, aggregate_id: g.id, payload: { full_name: 'Publicada Um' } });
        expect(typeof criado.envelope.aggregate_version).toBe('number');
        expect(atualizado.envelope.aggregate_version).toBeGreaterThan(criado.envelope.aggregate_version);
        expect(criado.envelope.occurred_at).toMatch(/Z$/);
    });

    it('sem confirmação do broker, nada é marcado: o lote volta na próxima rodada (pelo menos uma vez)', async () => {
        await createGuest(app, jwt, { full_name: 'Sem Confirmação' });
        const publicador = createOutboxPublisher();

        await expect(publicador.publishPending(canalFalso({ confirma: false }))).rejects.toThrow('nack');
        expect(await pendentes()).toBe(1);

        const canal = canalFalso();
        expect(await publicador.publishPending(canal)).toBe(1);
        expect(canal.publicados[0].envelope.payload.full_name).toBe('Sem Confirmação');
        expect(await pendentes()).toBe(0);
    });

    it('broker bloqueado (alarme de memória/disco) não prende a réplica: estoura o prazo e nada é marcado', async () => {
        await createGuest(app, jwt, { full_name: 'Broker Bloqueado' });

        await expect(createOutboxPublisher({ confirmTimeoutMs: 50 }).publishPending(canalFalso({ trava: true }))).rejects.toThrow('não confirmou');
        expect(await pendentes()).toBe(1);
    });

    it('evento sem fila de destino (devolvido pelo broker) desfaz o lote: nada é marcado como entregue', async () => {
        await createGuest(app, jwt, { full_name: 'Sem Fila' });

        await expect(createOutboxPublisher().publishPending(canalFalso({ semFila: ['guest.created'] }))).rejects.toThrow('sem fila de destino');
        expect(await pendentes()).toBe(1);
    });

    it('respeita o tamanho do lote', async () => {
        for (let i = 0; i < 5; i++) await createGuest(app, jwt, { full_name: `Lote ${i}` });
        const canal = canalFalso();

        expect(await createOutboxPublisher({ batchSize: 2 }).publishPending(canal)).toBe(2);
        expect(await pendentes()).toBe(3);
    });

    it('duas réplicas ao mesmo tempo não publicam o mesmo evento (FOR UPDATE SKIP LOCKED)', async () => {
        for (let i = 0; i < 6; i++) await createGuest(app, jwt, { full_name: `Réplica ${i}` });
        const a = canalFalso({ atrasoMs: 200 });
        const b = canalFalso({ atrasoMs: 200 });

        await Promise.all([
            createOutboxPublisher({ batchSize: 3 }).publishPending(a),
            createOutboxPublisher({ batchSize: 3 }).publishPending(b),
        ]);

        const ids = [...a.publicados, ...b.publicados].map((p) => p.envelope.event_id);
        expect(ids).toHaveLength(6);
        expect(new Set(ids).size).toBe(6);
        expect(await pendentes()).toBe(0);
    });

    it('lote preso por outra réplica não trava esta: ela pula as linhas travadas (SKIP LOCKED)', async () => {
        // Sem SKIP LOCKED o PostgreSQL não duplica — ele ESPERA a outra réplica terminar. O teste
        // anterior não distingue isso; este prende um lote de propósito e exige resposta imediata.
        for (let i = 0; i < 4; i++) await createGuest(app, jwt, { full_name: `Travado ${i}` });
        const outra = await sequelize.transaction();
        const presas = await sequelize.query(
            'SELECT id FROM outbox WHERE published_at IS NULL ORDER BY id LIMIT 2 FOR UPDATE',
            { type: QueryTypes.SELECT, transaction: outra },
        );
        const canal = canalFalso();
        const publicando = createOutboxPublisher({ batchSize: 4 }).publishPending(canal);
        try {
            const resultado = await Promise.race([
                publicando,
                new Promise((ok) => setTimeout(() => ok('bloqueou'), 3000)),
            ]);
            expect(resultado).toBe(2);
            const idsPresos = presas.map((r) => Number(r.id));
            const publicadasPresas = canal.publicados.filter((p) => idsPresos.includes(p.envelope.aggregate_version));
            expect(publicadasPresas).toEqual([]);
        } finally {
            await outra.rollback();
            await publicando;
        }
    });
});

describe('Broker fora do ar (CA-01.4.c)', () => {
    it('a API continua respondendo e os eventos acumulam no outbox; a espera cresce até 30 s', async () => {
        const esperas = [];
        const publicador = createOutboxPublisher({
            connect: async () => { throw new Error('connect ECONNREFUSED rabbitmq:5672'); },
            sleep: async (ms) => { esperas.push(ms); if (esperas.length >= 8) publicador.stop(); },
            logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
        });
        const rodando = publicador.start();

        const res = await request(app).post('/guests').set({ Authorization: `Bearer ${jwt}` }).send({ full_name: 'Broker Fora', email: `broker_${Date.now()}@t.test` });
        await rodando;

        expect(res.status).toBe(201);
        expect(await pendentes()).toBeGreaterThanOrEqual(1);
        expect(esperas.slice(0, 6)).toEqual([1000, 2000, 4000, 8000, 16000, 30000]);
        expect(Math.max(...esperas)).toBe(30000);
    });

    it('quando o broker volta, o acumulado sai e a espera volta ao intervalo normal', async () => {
        await createGuest(app, jwt, { full_name: 'Acumulado' });
        const canal = canalFalso();
        let tentativas = 0;
        const esperas = [];
        const publicador = createOutboxPublisher({
            connect: async () => {
                tentativas++;
                if (tentativas < 3) throw new Error('ECONNREFUSED');
                return { channel: canal, close: async () => {} };
            },
            sleep: async (ms) => { esperas.push(ms); if (canal.publicados.length > 0) publicador.stop(); },
            logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
        });

        await publicador.start();

        expect(canal.publicados.map((p) => p.envelope.payload.full_name)).toContain('Acumulado');
        expect(await pendentes()).toBe(0);
        expect(esperas).toEqual([1000, 2000, 1000]);
    });
});

describe('Retenção do outbox (LGPD)', () => {
    it('apaga só o que foi publicado há mais do prazo; pendente e recente ficam', async () => {
        await createGuest(app, jwt, { full_name: 'Antigo' });
        await createGuest(app, jwt, { full_name: 'Recente' });
        await createGuest(app, jwt, { full_name: 'Pendente' });
        await sequelize.query(`UPDATE outbox SET published_at = now() - interval '8 days' WHERE payload->>'full_name' = 'Antigo'`);
        await sequelize.query(`UPDATE outbox SET published_at = now() - interval '6 days' WHERE payload->>'full_name' = 'Recente'`);
        const nomes = async () => (await sequelize.query(
            `SELECT payload->>'full_name' AS n FROM outbox WHERE payload->>'full_name' IN ('Antigo', 'Recente', 'Pendente') ORDER BY id`,
            { type: QueryTypes.SELECT },
        )).map((r) => r.n);

        expect(await createOutboxPublisher({ retentionDays: 7 }).purgePublished()).toBeGreaterThanOrEqual(1);
        expect(await nomes()).toEqual(['Recente', 'Pendente']);
    });
});
