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

// Reauditoria delta da H.2 (docs/qa/redteam_analytics-service-h2_delta_24out2026.md).
const comEntregas = (deliveryCount, rejeicoes = 0) => {
    const m = mensagem();
    m.properties.headers = { 'x-delivery-count': deliveryCount };
    if (rejeicoes) m.properties.headers['x-death'] = [{ queue: 'analytics.core-events', reason: 'rejected', count: rejeicoes }];
    return m;
};
const canalOk = () => ({ ack: vi.fn(), nack: vi.fn(), publish: vi.fn(), waitForConfirms: vi.fn(async () => {}) });

describe('🟡-A — teto de x-delivery-count no caminho de infraestrutura', () => {
    const falhaDeConexao = async () => { throw erroDeConexao(); };

    it('abaixo do teto: pausa (sem ack/nack)', async () => {
        const canal = canalOk();
        const aviso = vi.fn();
        await createMessageHandler({ channel: canal, apply: falhaDeConexao, logger: silencioso, onInfrastructureFailure: aviso, maxInfraRedeliveries: 10 })(comEntregas(9));
        expect(aviso).toHaveBeenCalledTimes(1);
        expect(canal.nack).not.toHaveBeenCalled();
    });

    it('no teto: vira falha transitória comum — nack sem reenfileirar (rejected, x-death contado), sem pausar', async () => {
        const canal = canalOk();
        const aviso = vi.fn();
        const msg = comEntregas(10);
        await createMessageHandler({ channel: canal, apply: falhaDeConexao, logger: silencioso, onInfrastructureFailure: aviso, maxInfraRedeliveries: 10 })(msg);
        expect(aviso).not.toHaveBeenCalled();
        expect(canal.nack).toHaveBeenCalledWith(msg, false, false);
    });

    it('mensagem que já foi rejeitada (voltou da fila de espera) não pausa mais: conta tentativa até a DLQ', async () => {
        const canal = canalOk();
        const aviso = vi.fn();
        await createMessageHandler({ channel: canal, apply: falhaDeConexao, logger: silencioso, onInfrastructureFailure: aviso })(comEntregas(0, 2));
        expect(aviso).not.toHaveBeenCalled();
        expect(canal.nack).toHaveBeenCalledTimes(1);

        const naQuinta = canalOk();
        await createMessageHandler({ channel: naQuinta, apply: falhaDeConexao, logger: silencioso, onInfrastructureFailure: aviso })(comEntregas(0, 4));
        expect(naQuinta.publish.mock.calls[0][0]).toBe('analytics.dlx');
        expect(naQuinta.publish.mock.calls[0][3].headers).toMatchObject({ 'x-error-kind': 'transient', 'x-attempts': 5 });
    });

    it('o teto padrão fica bem abaixo do delivery-limit padrão (20) da fila quorum', async () => {
        const canal = canalOk();
        await createMessageHandler({ channel: canal, apply: falhaDeConexao, logger: silencioso })(comEntregas(10));
        expect(canal.nack).toHaveBeenCalledTimes(1);
    });
});

describe('🟢-C — o backoff zera quando o consumo volta', () => {
    it('duas pausas separadas esperam o mesmo 1 s, não 1 s e depois 2 s', async () => {
        const conexoes = [conexaoFalsa(), conexaoFalsa(), conexaoFalsa()];
        const connect = vi.fn();
        conexoes.forEach((c) => connect.mockResolvedValueOnce(c.conexao));
        const esperas = [];
        const consumidor = createConsumer({
            connect, apply: async () => { throw erroDeConexao(); }, logger: silencioso,
            sleep: async (ms) => { esperas.push(ms); }
        });
        const laco = consumidor.start();
        for (const c of conexoes.slice(0, 2)) {
            await vi.waitFor(() => expect(c.handlers).toHaveLength(1));
            await c.handlers[0](mensagem());          // pausa por banco fora
            await vi.waitFor(() => expect(c.conexao.close).toHaveBeenCalled());
        }
        await vi.waitFor(() => expect(conexoes[2].channel.consume).toHaveBeenCalled());
        expect(esperas).toEqual([1000, 1000]);
        await consumidor.stop();
        await laco;
    });
});

describe('🟢-B — stop() durante connect(), ready() ou a espera do backoff', () => {
    it('stop() enquanto connect() está em andamento resolve e fecha a conexão que chegar depois', async () => {
        const { conexao } = conexaoFalsa();
        let completar;
        const consumidor = createConsumer({ connect: () => new Promise((r) => { completar = () => r(conexao); }), logger: silencioso, sleep: async () => {} });
        consumidor.start();
        await vi.waitFor(() => expect(completar).toBeTypeOf('function'));
        const parando = consumidor.stop();
        completar();
        await expect(Promise.race([parando.then(() => 'resolveu'), new Promise((r) => setTimeout(() => r('travou'), 2000))])).resolves.toBe('resolveu');
        expect(conexao.close).toHaveBeenCalled();
        expect(consumidor.status()).toBe('stopped');
    });

    it('stop() durante a espera do backoff interrompe a espera', async () => {
        const consumidor = createConsumer({
            connect: async () => { throw new Error('broker fora'); }, logger: silencioso,
            sleep: () => new Promise(() => {})        // espera que nunca termina sozinha
        });
        consumidor.start();
        await new Promise((r) => setTimeout(r, 50));
        const r = await Promise.race([consumidor.stop().then(() => 'resolveu'), new Promise((res) => setTimeout(() => res('travou'), 2000))]);
        expect(r).toBe('resolveu');
    });

    it('stop() com connect() que nunca responde resolve no prazo (stopTimeoutMs)', async () => {
        const consumidor = createConsumer({ connect: () => new Promise(() => {}), logger: silencioso, stopTimeoutMs: 200 });
        consumidor.start();
        await new Promise((r) => setTimeout(r, 20));
        const r = await Promise.race([consumidor.stop().then(() => 'resolveu'), new Promise((res) => setTimeout(() => res('travou'), 2000))]);
        expect(r).toBe('resolveu');
    });
});

describe('🟡-A2 — a pausa drena as mensagens em andamento antes de fechar', () => {
    it('cancela o consumo, deixa a mensagem lenta acima do teto dar nack e só então fecha a conexão', async () => {
        const { conexao, channel, handlers } = conexaoFalsa();
        channel.close = vi.fn(async () => {});   // fechamento ordenado: canal antes da conexão
        const idLenta = randomUUID();
        const comAgregado = (aggregateId, entregas) => {
            const m = comEntregas(entregas);
            m.content = toBuffer(envelope('guest.created', { tenantId, aggregateId, payload: { full_name: 'X' } }));
            return m;
        };
        let liberarLenta;
        const apply = vi.fn(async (evento) => {
            if (evento.aggregateId === idLenta) await new Promise((r) => { liberarLenta = r; });
            throw erroDeConexao();
        });
        // Depois da pausa o laço reconecta: a 2ª conexão é outra (a 1ª já fechou).
        const segunda = conexaoFalsa();
        const connect = vi.fn().mockResolvedValueOnce(conexao).mockResolvedValue(segunda.conexao);
        const consumidor = createConsumer({ connect, apply, logger: silencioso, sleep: async () => {}, maxInfraRedeliveries: 3 });
        const laco = consumidor.start();
        await vi.waitFor(() => expect(handlers).toHaveLength(1));

        // A (lenta, já no teto) entra primeiro; F (nova) falha na hora e pede a pausa.
        const lenta = comAgregado(idLenta, 3);
        const rapida = comAgregado(randomUUID(), 0);
        const emA = handlers[0](lenta);
        await vi.waitFor(() => expect(apply).toHaveBeenCalledTimes(1));
        await handlers[0](rapida);

        await vi.waitFor(() => expect(channel.cancel).toHaveBeenCalledWith('tag-1'));
        expect(conexao.close).not.toHaveBeenCalled();     // A ainda decidindo: não fecha
        liberarLenta();
        await emA;
        await vi.waitFor(() => expect(conexao.close).toHaveBeenCalled());
        expect(channel.nack).toHaveBeenCalledWith(lenta, false, false);        // A seguiu o próprio teto
        expect(channel.nack).not.toHaveBeenCalledWith(rapida, false, false);   // F escolheu pausar
        expect(channel.nack.mock.invocationCallOrder[0]).toBeLessThan(channel.close.mock.invocationCallOrder[0]);
        // O canal fecha (e espera o close-ok) antes da conexão: fechar a conexão logo depois do nack fazia o
        // broker perder o nack da fila quorum.
        expect(channel.close.mock.invocationCallOrder[0]).toBeLessThan(conexao.close.mock.invocationCallOrder[0]);

        await consumidor.stop();
        await laco;
    });
});
