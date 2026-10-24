import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'crypto';
import { QueryTypes } from 'sequelize';
import sequelize from '../database/connections/sequelize.js';
import applyEvent from '../app/events/applyEvent.js';
import { createConsumer, rabbitConnectFromEnv, QUEUE, MAX_ATTEMPTS } from '../app/consumer/consumer.js';
import { GuestProjection, ReservationProjection } from '../app/Models/index.js';
import { envelope, toBuffer, truncateAll } from './helpers/events.js';

// Integração com RabbitMQ DE VERDADE (CA-01.4.h e CA-01.4.i), com a topologia e os usuários do
// infra/k8s/rabbitmq-setup.sh: publica como o core (credencial hotel_core_publisher, na exchange
// gesway.core.events) e consome com a credencial do analytics — a mesma separação do §8.
// Sem RABBITMQ_HOST no .env.test o arquivo é pulado (o CI ainda não tem broker — pendência do Weslley).

const EXCHANGE = 'gesway.core.events';
const DLQ = 'analytics.core-events.dlq';
const temBroker = Boolean(process.env.RABBITMQ_HOST);
const silencioso = { info: () => {}, warn: () => {}, error: () => {} };

async function conectar(usuario, senha) {
    const { connect } = await import('amqplib');
    return connect({
        hostname: process.env.RABBITMQ_HOST, port: Number(process.env.RABBITMQ_PORT),
        username: usuario, password: senha
    });
}

async function esperar(condicao, { timeoutMs = 10000, intervaloMs = 100 } = {}) {
    const limite = Date.now() + timeoutMs;
    for (;;) {
        const valor = await condicao();
        if (valor) return valor;
        if (Date.now() > limite) throw new Error('condição não atingida no prazo');
        await new Promise((r) => setTimeout(r, intervaloMs));
    }
}

describe.skipIf(!temBroker)('RabbitMQ real — consumidor do analytics (§5)', () => {
    const tenantId = randomUUID();
    const falhasTransitorias = new Map();   // aggregate_id → nº de chamadas que falharam
    const bancoForaPara = new Map();        // aggregate_id → quantas entregas ainda acham o banco fora
    let conexaoCore;
    let canalCore;
    let conexaoLeitura;
    let canalLeitura;
    let consumidor;

    const publicar = async (corpo, { type = 'teste' } = {}) => {
        canalCore.publish(EXCHANGE, type, Buffer.isBuffer(corpo) ? corpo : toBuffer(corpo), {
            persistent: true, mandatory: true, contentType: 'application/json',
            messageId: corpo.event_id ?? randomUUID(), type
        });
        await canalCore.waitForConfirms();
    };
    const processados = async () =>
        (await sequelize.query('SELECT count(*)::int AS n FROM processed_events', { type: QueryTypes.SELECT }))[0].n;
    const proximaDaDlq = () => esperar(async () => canalLeitura.get(DLQ, { noAck: true }), { timeoutMs: 90000, intervaloMs: 250 });

    beforeAll(async () => {
        await truncateAll();
        conexaoLeitura = await conectar(process.env.RABBITMQ_ANALYTICS_USER, process.env.RABBITMQ_ANALYTICS_PASSWORD);
        canalLeitura = await conexaoLeitura.createChannel();
        await canalLeitura.purgeQueue(QUEUE);
        await canalLeitura.purgeQueue(DLQ);

        conexaoCore = await conectar(process.env.RABBITMQ_CORE_USER, process.env.RABBITMQ_CORE_PASSWORD);
        canalCore = await conexaoCore.createConfirmChannel();

        // O apply real, com falha transitória simulada para os agregados marcados no teste.
        const apply = async (evento) => {
            if ((bancoForaPara.get(evento.aggregateId) ?? 0) > 0) {
                bancoForaPara.set(evento.aggregateId, bancoForaPara.get(evento.aggregateId) - 1);
                throw Object.assign(new Error('connect ECONNREFUSED (simulado)'), { name: 'SequelizeConnectionRefusedError' });
            }
            if (falhasTransitorias.has(evento.aggregateId)) {
                falhasTransitorias.set(evento.aggregateId, falhasTransitorias.get(evento.aggregateId) + 1);
                throw Object.assign(new Error('deadlock detectado (simulado)'), { original: { code: '40P01' } });   // transitório da mensagem
            }
            return applyEvent(evento);
        };
        consumidor = createConsumer({ connect: rabbitConnectFromEnv(process.env), apply, logger: silencioso });
        consumidor.start();
    });

    afterAll(async () => {
        await consumidor?.stop();
        await conexaoCore?.close().catch(() => {});
        await conexaoLeitura?.close().catch(() => {});
    });

    it('evento publicado pelo core atualiza a projeção', async () => {
        const env = envelope('guest.created', { tenantId, payload: { full_name: 'Elisa Broker' } });
        await publicar(env, { type: env.type });
        const g = await esperar(() => GuestProjection.findOne({ where: { id: env.aggregate_id, tenant_id: tenantId } }));
        expect(g.full_name).toBe('Elisa Broker');
    });

    it('CA-01.4.h: o mesmo evento publicado 2× não muda nada', async () => {
        const env = envelope('reservation.created', {
            tenantId,
            payload: { guest_id: randomUUID(), room_id: randomUUID(), status: 'CONFIRMED', check_in_date: '2027-01-10',
                check_out_date: '2027-01-12', total_amount: '480.00', created_at: '2026-10-21T10:00:00.000Z' }
        });
        await publicar(env, { type: env.type });
        const antes = (await esperar(() => ReservationProjection.findOne({ where: { id: env.aggregate_id, tenant_id: tenantId } }))).toJSON();
        const n = await processados();

        await publicar(env, { type: env.type });
        // Marcador depois da duplicata: quando ele chega, a duplicata (anterior na fila) já foi tratada.
        const marcador = envelope('guest.created', { tenantId, payload: { full_name: 'Marcador' } });
        await publicar(marcador, { type: marcador.type });
        await esperar(() => GuestProjection.findOne({ where: { id: marcador.aggregate_id, tenant_id: tenantId } }));

        expect((await ReservationProjection.findOne({ where: { id: env.aggregate_id, tenant_id: tenantId } })).toJSON()).toEqual(antes);
        expect(await ReservationProjection.count({ where: { tenant_id: tenantId } })).toBe(1);
        expect(await processados()).toBe(n + 1);   // só o marcador entrou; a duplicata não
    });

    it('CA-01.4.h: versão antiga publicada depois da nova é ignorada', async () => {
        const id = randomUUID();
        const nova = envelope('guest.updated', { tenantId, aggregateId: id, aggregateVersion: 900, payload: { full_name: 'Versão nova' } });
        const antiga = envelope('guest.updated', { tenantId, aggregateId: id, aggregateVersion: 899, payload: { full_name: 'Versão antiga' } });
        await publicar(nova, { type: nova.type });
        await esperar(() => GuestProjection.findOne({ where: { id, tenant_id: tenantId } }));
        await publicar(antiga, { type: antiga.type });
        await esperar(async () => (await sequelize.query('SELECT 1 FROM processed_events WHERE event_id = :e',
            { replacements: { e: antiga.event_id }, type: QueryTypes.SELECT })).length === 1);

        const g = await GuestProjection.findOne({ where: { id, tenant_id: tenantId } });
        expect(g.full_name).toBe('Versão nova');
        expect(Number(g.aggregate_version)).toBe(900);
    });

    it('CA-01.4.i: JSON inválido vai direto para a DLQ e não bloqueia o evento seguinte', async () => {
        await publicar(Buffer.from('{isto não é json'), { type: 'guest.created' });
        const seguinte = envelope('guest.created', { tenantId, payload: { full_name: 'Depois do inválido' } });
        await publicar(seguinte, { type: seguinte.type });

        await esperar(() => GuestProjection.findOne({ where: { id: seguinte.aggregate_id, tenant_id: tenantId } }));
        const morta = await proximaDaDlq();
        expect(morta.content.toString()).toBe('{isto não é json');
        expect(morta.properties.headers).toMatchObject({ 'x-error': 'JSON inválido', 'x-error-kind': 'permanent', 'x-attempts': 1 });
    });

    it(`CA-01.4.i: erro transitório tem nova tentativa a cada 10 s e vai para a DLQ na ${MAX_ATTEMPTS}ª, sem bloquear os outros`, async () => {
        const env = envelope('guest.created', { tenantId, payload: { full_name: 'Sempre falha' } });
        falhasTransitorias.set(env.aggregate_id, 0);
        const inicio = Date.now();
        await publicar(env, { type: env.type });

        // Enquanto ele espera a nova tentativa, outro evento passa normalmente.
        await esperar(() => falhasTransitorias.get(env.aggregate_id) >= 1);
        const outro = envelope('guest.created', { tenantId, payload: { full_name: 'Não esperou' } });
        await publicar(outro, { type: outro.type });
        await esperar(() => GuestProjection.findOne({ where: { id: outro.aggregate_id, tenant_id: tenantId } }));
        expect(falhasTransitorias.get(env.aggregate_id)).toBeLessThan(MAX_ATTEMPTS);

        const morta = await proximaDaDlq();
        expect(JSON.parse(morta.content.toString()).event_id).toBe(env.event_id);
        expect(morta.properties.headers).toMatchObject({ 'x-error-kind': 'transient', 'x-attempts': MAX_ATTEMPTS });
        expect(falhasTransitorias.get(env.aggregate_id)).toBe(MAX_ATTEMPTS);
        expect(Date.now() - inicio).toBeGreaterThanOrEqual(4 * 10000 - 1000);   // 4 esperas de 10 s
        expect(await GuestProjection.count({ where: { id: env.aggregate_id } })).toBe(0);
    }, 120000);

    it('🟡-3: banco do analytics fora do ar pausa o consumo sem gastar tentativa — a mensagem volta e é aplicada, sem DLQ', async () => {
        const env = envelope('guest.created', { tenantId, payload: { full_name: 'Banco voltou' } });
        bancoForaPara.set(env.aggregate_id, 2);   // as 2 primeiras entregas encontram o banco fora
        await publicar(env, { type: env.type });

        const g = await esperar(() => GuestProjection.findOne({ where: { id: env.aggregate_id, tenant_id: tenantId } }), { timeoutMs: 30000 });
        expect(g.full_name).toBe('Banco voltou');
        expect(bancoForaPara.get(env.aggregate_id)).toBe(0);
        expect(await canalLeitura.get(DLQ, { noAck: true })).toBe(false);   // nada foi para a DLQ
    }, 60000);

    it('§8: a credencial do analytics NÃO publica na exchange do core (não fabrica evento)', async () => {
        const conexao = await conectar(process.env.RABBITMQ_ANALYTICS_USER, process.env.RABBITMQ_ANALYTICS_PASSWORD);
        conexao.on('error', () => {});
        const canal = await conexao.createConfirmChannel();
        const fechado = new Promise((resolve) => canal.once('error', resolve));
        canal.publish(EXCHANGE, 'guest.created', toBuffer(envelope('guest.created', { tenantId, payload: { full_name: 'Forjado' } })));
        const erro = await fechado;
        expect(String(erro.message)).toMatch(/ACCESS_REFUSED/);
        await conexao.close().catch(() => {});
    });
});
