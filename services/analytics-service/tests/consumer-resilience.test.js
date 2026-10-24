import { describe, it, expect, vi } from 'vitest';
import { randomUUID } from 'crypto';
import { createMessageHandler, createConsumer, isInfrastructureFailure } from '../app/consumer/consumer.js';
import { envelope, toBuffer } from './helpers/events.js';

// Ressalvas do qa-redteam da H.2 (docs/qa/redteam_analytics-service-h2_21out2026.md):
//   🟡-1 queda do canal no meio de uma mensagem não pode derrubar o processo;
//   🟡-3 banco do analytics fora do ar não gasta as tentativas das mensagens;
//   🟢-4 desligamento ordenado (SIGTERM).
// Rejeição não tratada derruba o processo no Node 24 — e o Vitest reprova a rodada se uma escapar.

const silencioso = { info: () => {}, warn: () => {}, error: () => {} };
const tenantId = '0b07ddaa-0083-4b21-ae07-b5dbcd49df0d';
const mensagem = () => ({
    content: toBuffer(envelope('tenant.created', { tenantId, aggregateId: tenantId, payload: { status: 'ACTIVE' } })),
    properties: { messageId: randomUUID(), headers: {} }
});
const canalFechado = () => {
    const erro = () => { throw Object.assign(new Error('Channel closed'), { name: 'IllegalOperationError' }); };
    return { ack: vi.fn(erro), nack: vi.fn(erro), publish: vi.fn(erro), waitForConfirms: vi.fn(async () => {}) };
};
const erroDeConexao = () => Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), { name: 'SequelizeConnectionRefusedError' });

function conexaoFalsa() {
    let derrubar;
    const handlers = [];
    const channel = {
        ack: vi.fn(), nack: vi.fn(), publish: vi.fn(), waitForConfirms: vi.fn(async () => {}),
        prefetch: vi.fn(async () => {}),
        consume: vi.fn(async (_fila, handler) => { handlers.push(handler); return { consumerTag: 'tag-1' }; }),
        cancel: vi.fn(async () => {})
    };
    const conexao = {
        channel,
        closed: new Promise((resolve) => { derrubar = resolve; }),
        close: vi.fn(async () => { derrubar(); })
    };
    return { conexao, channel, handlers, derrubar: () => derrubar() };
}

describe('🟡-1 — canal fechado no meio de uma mensagem', () => {
    it('ack depois do commit com o canal fechado: o handler resolve (sem rejeição) e não tenta nack', async () => {
        const canal = canalFechado();
        await expect(createMessageHandler({ channel: canal, apply: async () => 'applied', logger: silencioso })(mensagem())).resolves.toBeUndefined();
        expect(canal.nack).not.toHaveBeenCalled();   // o evento foi aplicado: a reentrega cai em 'duplicate'
    });

    it('nack de erro transitório com o canal fechado: o handler resolve (sem rejeição)', async () => {
        const canal = canalFechado();
        const apply = async () => { throw Object.assign(new Error('deadlock'), { original: { code: '40P01' } }); };
        await expect(createMessageHandler({ channel: canal, apply, logger: silencioso })(mensagem())).resolves.toBeUndefined();
    });

    it('a conexão cai com mensagem em andamento: o processo segue e o laço reconecta', async () => {
        const primeira = conexaoFalsa();
        const segunda = conexaoFalsa();
        const connect = vi.fn().mockResolvedValueOnce(primeira.conexao).mockResolvedValueOnce(segunda.conexao);
        let confirmar;
        const apply = vi.fn(() => new Promise((resolve) => { confirmar = resolve; }));
        const consumidor = createConsumer({ connect, apply, logger: silencioso, sleep: async () => {} });
        const laco = consumidor.start();

        await vi.waitFor(() => expect(primeira.handlers).toHaveLength(1));
        const emAndamento = primeira.handlers[0](mensagem());
        await vi.waitFor(() => expect(apply).toHaveBeenCalled());

        primeira.channel.ack.mockImplementation(() => { throw new Error('Channel closed'); });
        primeira.derrubar();                       // broker reiniciou
        confirmar('applied');                      // a transação confirma depois da queda
        await expect(emAndamento).resolves.toBeUndefined();

        await vi.waitFor(() => expect(connect).toHaveBeenCalledTimes(2));
        await vi.waitFor(() => expect(segunda.channel.consume).toHaveBeenCalled());
        expect(consumidor.status()).toBe('consuming');

        await consumidor.stop();
        await laco;
    });
});

describe('🟡-3 — banco do analytics fora do ar não é falha da mensagem', () => {
    it('reconhece erro de conexão (Sequelize e SQLSTATE 08/57P0x/53300) e não confunde com deadlock ou dado inválido', () => {
        expect(isInfrastructureFailure(erroDeConexao())).toBe(true);
        expect(isInfrastructureFailure(Object.assign(new Error(), { name: 'SequelizeConnectionAcquireTimeoutError' }))).toBe(true);
        expect(isInfrastructureFailure(Object.assign(new Error(), { original: { code: '08006' } }))).toBe(true);
        expect(isInfrastructureFailure(Object.assign(new Error(), { parent: { code: '57P01' } }))).toBe(true);
        expect(isInfrastructureFailure(Object.assign(new Error(), { original: { code: '53300' } }))).toBe(true);
        expect(isInfrastructureFailure(Object.assign(new Error(), { original: { code: '40P01' } }))).toBe(false);
        expect(isInfrastructureFailure(Object.assign(new Error(), { original: { code: '22003' } }))).toBe(false);
        expect(isInfrastructureFailure(new Error('qualquer'))).toBe(false);
    });

    it('no handler: nem ack, nem nack, nem DLQ — só avisa o consumidor (a mensagem volta sem contar tentativa)', async () => {
        const canal = { ack: vi.fn(), nack: vi.fn(), publish: vi.fn(), waitForConfirms: vi.fn() };
        const aviso = vi.fn();
        await createMessageHandler({ channel: canal, apply: async () => { throw erroDeConexao(); }, logger: silencioso, onInfrastructureFailure: aviso })(mensagem());
        expect(canal.ack).not.toHaveBeenCalled();
        expect(canal.nack).not.toHaveBeenCalled();
        expect(canal.publish).not.toHaveBeenCalled();
        expect(aviso).toHaveBeenCalledTimes(1);
    });

    it('no consumidor: fecha a conexão (o broker devolve as não confirmadas sem x-death) e só volta depois do ready()', async () => {
        const primeira = conexaoFalsa();
        const segunda = conexaoFalsa();
        const connect = vi.fn().mockResolvedValueOnce(primeira.conexao).mockResolvedValueOnce(segunda.conexao);
        let bancoNoAr = true;
        const ready = vi.fn(async () => { if (!bancoNoAr) throw new Error('banco fora do ar'); });
        const apply = vi.fn(async () => { throw erroDeConexao(); });
        const esperas = [];
        const consumidor = createConsumer({
            connect, ready, apply, logger: silencioso,
            sleep: async (ms) => { esperas.push(ms); if (esperas.length === 3) bancoNoAr = true; }
        });
        const laco = consumidor.start();

        await vi.waitFor(() => expect(primeira.handlers).toHaveLength(1));
        bancoNoAr = false;
        await primeira.handlers[0](mensagem());
        await vi.waitFor(() => expect(primeira.conexao.close).toHaveBeenCalled());
        expect(primeira.channel.nack).not.toHaveBeenCalled();

        await vi.waitFor(() => expect(segunda.channel.consume).toHaveBeenCalled());
        expect(ready.mock.calls.length).toBeGreaterThanOrEqual(3);   // tentou, falhou, esperou, até o banco voltar
        expect(esperas).toEqual([1000, 2000, 4000]);

        await consumidor.stop();
        await laco;
    });
});

describe('🟢-4 — desligamento ordenado', () => {
    it('stop(): para de consumir, termina a mensagem em andamento (com ack) e só então fecha a conexão', async () => {
        const { conexao, channel, handlers } = conexaoFalsa();
        let confirmar;
        const apply = vi.fn(() => new Promise((resolve) => { confirmar = resolve; }));
        const consumidor = createConsumer({ connect: async () => conexao, apply, logger: silencioso, sleep: async () => {} });
        const laco = consumidor.start();
        await vi.waitFor(() => expect(handlers).toHaveLength(1));
        handlers[0](mensagem());
        await vi.waitFor(() => expect(apply).toHaveBeenCalled());

        const parando = consumidor.stop();
        await vi.waitFor(() => expect(channel.cancel).toHaveBeenCalledWith('tag-1'));
        expect(conexao.close).not.toHaveBeenCalled();   // ainda há mensagem em andamento

        confirmar('applied');
        await parando;
        expect(channel.ack).toHaveBeenCalledTimes(1);
        expect(channel.ack.mock.invocationCallOrder[0]).toBeLessThan(conexao.close.mock.invocationCallOrder[0]);
        await laco;
        expect(consumidor.status()).toBe('stopped');
    });
});
