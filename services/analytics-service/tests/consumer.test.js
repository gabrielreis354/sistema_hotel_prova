import { describe, it, expect, vi } from 'vitest';
import { randomUUID } from 'crypto';
import {
    createMessageHandler, createConsumer, previousFailures, isPermanent,
    QUEUE, DEAD_LETTER_EXCHANGE, MAX_ATTEMPTS, PREFETCH
} from '../app/consumer/consumer.js';
import { PermanentEventError } from '../app/events/catalog.js';
import { envelope, toBuffer } from './helpers/events.js';

// Política do consumidor (catálogo v1.0 §5.1 e §5.3, CA-01.4.i) com canal falso — o teste com
// RabbitMQ de verdade está em rabbitmq.integration.test.js.

const silencioso = { info: () => {}, warn: () => {}, error: () => {} };

function canalFalso({ confirmaDlq = true } = {}) {
    return {
        ack: vi.fn(),
        nack: vi.fn(),
        publish: vi.fn(() => true),
        waitForConfirms: vi.fn(() => (confirmaDlq ? Promise.resolve() : Promise.reject(new Error('sem confirmação')))),
        prefetch: vi.fn(async () => {}),
        consume: vi.fn(async () => {})
    };
}
const mensagem = (falhasAnteriores = 0, conteudo = toBuffer(envelope('tenant.created', { tenantId: '0b07ddaa-0083-4b21-ae07-b5dbcd49df0d', aggregateId: '0b07ddaa-0083-4b21-ae07-b5dbcd49df0d', payload: { status: 'ACTIVE' } }))) => ({
    content: conteudo,
    properties: {
        messageId: randomUUID(),
        contentType: 'application/json',
        type: 'tenant.created',
        headers: falhasAnteriores
            ? { 'x-death': [
                { queue: 'analytics.core-events.retry', reason: 'expired', count: falhasAnteriores },
                { queue: QUEUE, reason: 'rejected', count: falhasAnteriores }
            ] }
            : {}
    }
});
// Transitório DA MENSAGEM (deadlock). Erro de conexão com o banco é infraestrutura e tem outro caminho (🟡-3).
const erroTransitorio = () => Object.assign(new Error('deadlock detectado'), { original: { code: '40P01' } });

describe('Recebimento (§5.1)', () => {
    it('ack só DEPOIS que a transação da projeção confirma', async () => {
        const canal = canalFalso();
        let confirmar;
        const apply = vi.fn(() => new Promise((resolve) => { confirmar = resolve; }));
        const pendente = createMessageHandler({ channel: canal, apply, logger: silencioso })(mensagem());

        await vi.waitFor(() => expect(apply).toHaveBeenCalled());
        expect(canal.ack).not.toHaveBeenCalled();   // transação ainda aberta
        confirmar('applied');
        await pendente;
        expect(canal.ack).toHaveBeenCalledTimes(1);
        expect(canal.nack).not.toHaveBeenCalled();
    });

    it('evento repetido também recebe ack (sem reaplicar)', async () => {
        const canal = canalFalso();
        await createMessageHandler({ channel: canal, apply: async () => 'duplicate', logger: silencioso })(mensagem());
        expect(canal.ack).toHaveBeenCalledTimes(1);
    });

    it('consumidor com prefetch 10 e ack manual, sem declarar fila (o usuário do analytics não tem configure — §8)', async () => {
        const canal = canalFalso();
        let derrubar;
        const conexao = { channel: canal, closed: new Promise((r) => { derrubar = r; }), close: vi.fn(async () => {}) };
        const consumidor = createConsumer({ connect: async () => conexao, logger: silencioso, sleep: async () => {} });
        const laco = consumidor.start();

        await vi.waitFor(() => expect(canal.consume).toHaveBeenCalled());
        expect(canal.prefetch).toHaveBeenCalledWith(PREFETCH);
        expect(PREFETCH).toBe(10);
        expect(canal.consume.mock.calls[0][0]).toBe(QUEUE);
        expect(canal.consume.mock.calls[0][2]).toEqual({ noAck: false });
        expect(canal.assertQueue).toBeUndefined();

        const parando = consumidor.stop();   // stop() espera o laço, que sai quando a conexão fecha
        derrubar();
        await parando;
        await laco;
    });

    it('sem banco pronto (schema ausente) não consome — espera e tenta de novo', async () => {
        const connect = vi.fn();
        let chamadas = 0;
        const consumidor = createConsumer({
            connect,
            ready: async () => { chamadas++; if (chamadas >= 3) consumidor.stop(); throw new Error('schema ausente'); },
            logger: silencioso,
            sleep: async () => {}
        });
        await consumidor.start();
        expect(chamadas).toBe(3);
        expect(connect).not.toHaveBeenCalled();
    });
});

describe('Falhas (§5.3, CA-01.4.i)', () => {
    it('erro PERMANENTE vai direto para analytics.dlx, com motivo, e recebe ack — sem nova tentativa', async () => {
        const canal = canalFalso();
        const msg = mensagem(0, Buffer.from('{json quebrado'));
        await createMessageHandler({ channel: canal, logger: silencioso })(msg);

        expect(canal.publish).toHaveBeenCalledTimes(1);
        const [exchange, routingKey, corpo, opcoes] = canal.publish.mock.calls[0];
        expect(exchange).toBe(DEAD_LETTER_EXCHANGE);
        expect(routingKey).toBe('');
        expect(corpo).toBe(msg.content);
        expect(opcoes).toMatchObject({ persistent: true, messageId: msg.properties.messageId });
        expect(opcoes.headers).toMatchObject({ 'x-error': 'JSON inválido', 'x-error-kind': 'permanent', 'x-attempts': 1 });
        expect(canal.waitForConfirms).toHaveBeenCalled();
        expect(canal.ack).toHaveBeenCalledWith(msg);
        expect(canal.nack).not.toHaveBeenCalled();
    });

    it.each([1, 2, 3, 4])('erro TRANSITÓRIO na tentativa %i → nack sem reenfileirar (vai para a espera de 10 s)', async (tentativa) => {
        const canal = canalFalso();
        const msg = mensagem(tentativa - 1);
        await createMessageHandler({ channel: canal, apply: async () => { throw erroTransitorio(); }, logger: silencioso })(msg);
        expect(canal.nack).toHaveBeenCalledWith(msg, false, false);
        expect(canal.ack).not.toHaveBeenCalled();
        expect(canal.publish).not.toHaveBeenCalled();
    });

    it(`na ${MAX_ATTEMPTS}ª falha transitória vai para analytics.dlx com o número de tentativas e recebe ack`, async () => {
        const canal = canalFalso();
        const msg = mensagem(MAX_ATTEMPTS - 1);
        await createMessageHandler({ channel: canal, apply: async () => { throw erroTransitorio(); }, logger: silencioso })(msg);
        expect(canal.publish.mock.calls[0][0]).toBe(DEAD_LETTER_EXCHANGE);
        const headers = canal.publish.mock.calls[0][3].headers;
        expect(headers).toMatchObject({ 'x-error-kind': 'transient', 'x-attempts': 5, 'x-error': 'deadlock detectado' });
        expect(headers).not.toHaveProperty('x-death');   // cabeçalho do broker não é republicado
        expect(canal.ack).toHaveBeenCalledWith(msg);
        expect(canal.nack).not.toHaveBeenCalled();
    });

    it('sem confirmação da DLQ não dá ack — nack, e a mensagem volta para nova tentativa (nada se perde)', async () => {
        const canal = canalFalso({ confirmaDlq: false });
        const msg = mensagem(0, Buffer.from('nao-json'));
        await createMessageHandler({ channel: canal, logger: silencioso })(msg);
        expect(canal.ack).not.toHaveBeenCalled();
        expect(canal.nack).toHaveBeenCalledWith(msg, false, false);
    });

    it('mensagem nula (consumidor cancelado pelo broker) é ignorada', async () => {
        const canal = canalFalso();
        await createMessageHandler({ channel: canal, logger: silencioso })(null);
        expect(canal.ack).not.toHaveBeenCalled();
    });

    it('classifica os erros: catálogo e dado inválido (SQLSTATE 22/23) são permanentes; conexão e deadlock, transitórios', () => {
        expect(isPermanent(new PermanentEventError('x'))).toBe(true);
        expect(isPermanent(Object.assign(new Error(), { original: { code: '22003' } }))).toBe(true);
        expect(isPermanent(Object.assign(new Error(), { parent: { code: '23505' } }))).toBe(true);
        expect(isPermanent(Object.assign(new Error(), { original: { code: '40P01' } }))).toBe(false);
        expect(isPermanent(erroTransitorio())).toBe(false);
        expect(isPermanent(new Error('timeout'))).toBe(false);
    });

    it('conta as falhas pelo x-death da fila principal, não pelo da fila de espera', () => {
        expect(previousFailures(mensagem(0))).toBe(0);
        expect(previousFailures(mensagem(3))).toBe(3);
        expect(previousFailures({ properties: { headers: { 'x-death': [{ queue: 'outra', reason: 'rejected', count: 9 }] } } })).toBe(0);
    });
});
