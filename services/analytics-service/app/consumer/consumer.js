import { parseEvent, PermanentEventError } from '../events/catalog.js';
import applyEvent from '../events/applyEvent.js';

/**
 * Consumidor da fila `analytics.core-events` — política do catálogo v1.0 §5.
 *
 * - Prefetch 10; ack manual, só DEPOIS que a transação da projeção confirma (§5.1).
 * - Idempotência nas duas barreiras de applyEvent.js (§5.2, CA-01.4.h).
 * - Falha (§5.3, CA-01.4.i):
 *     · permanente (JSON inválido, tenant_id ausente, type desconhecido, version maior que a
 *       suportada, payload fora do contrato) → direto para `analytics.dlx`, sem nova tentativa;
 *     · transitória (banco fora, deadlock, timeout) → nack sem reenfileirar: o broker leva a
 *       mensagem à fila de espera de 10 s e a devolve. Na 5ª falha → `analytics.dlx`.
 *   A contagem vem do `x-death` que o próprio RabbitMQ acrescenta — o consumidor não guarda estado.
 * - Uma mensagem com problema não bloqueia as outras: o nack a tira da fila na hora.
 *
 * Nada aqui declara fila ou exchange: o usuário do analytics não tem `configure` (§8). A topologia é
 * do rabbitmq-setup.sh.
 */
export const QUEUE = 'analytics.core-events';
export const DEAD_LETTER_EXCHANGE = 'analytics.dlx';
export const MAX_ATTEMPTS = 5;
export const PREFETCH = 10;

// SQLSTATE do PostgreSQL que repetir não resolve: classe 22 (dado inválido) e 23 (violação de
// integridade). O resto — conexão (08), deadlock/serialização (40), recurso (53), operador (57) —
// pode passar sozinho e merece nova tentativa.
const SQLSTATE_PERMANENTE = /^(22|23)/;

export function isPermanent(error) {
    if (error instanceof PermanentEventError) return true;
    const code = error?.original?.code ?? error?.parent?.code;
    return typeof code === 'string' && SQLSTATE_PERMANENTE.test(code);
}

/** Quantas vezes esta mensagem já foi rejeitada pela fila principal (cabeçalho `x-death`). */
export function previousFailures(msg) {
    const mortes = msg.properties?.headers?.['x-death'];
    if (!Array.isArray(mortes)) return 0;
    const daFila = mortes.find((m) => m.queue === QUEUE && m.reason === 'rejected');
    return daFila ? Number(daFila.count) || 0 : 0;
}

/** Publica na fila de mensagens mortas com o motivo e espera a confirmação do broker. */
async function sendToDeadLetter(channel, msg, { error, attempts, permanent }) {
    // O x-death é do broker; o que a DLQ conta é o nosso x-attempts.
    const { 'x-death': _ignorado, ...headers } = msg.properties?.headers ?? {};
    channel.publish(DEAD_LETTER_EXCHANGE, '', msg.content, {
        persistent: true,
        contentType: msg.properties?.contentType,
        messageId: msg.properties?.messageId,
        type: msg.properties?.type,
        headers: {
            ...headers,
            'x-error': String(error?.message ?? error).slice(0, 500),
            'x-error-kind': permanent ? 'permanent' : 'transient',
            'x-attempts': attempts
        }
    });
    await channel.waitForConfirms();
}

// Falha de INFRAESTRUTURA, não da mensagem (qa-redteam H.2, 🟡-3): o banco do analytics fora do ar.
// Não gasta tentativa — com 5 × 10 s, um restart de rotina do banco mandaria a fila inteira à DLQ.
const ERROS_DE_CONEXAO = new Set([
    'SequelizeConnectionError', 'SequelizeConnectionRefusedError', 'SequelizeHostNotFoundError',
    'SequelizeHostNotReachableError', 'SequelizeInvalidConnectionError', 'SequelizeConnectionTimedOutError',
    'SequelizeConnectionAcquireTimeoutError'
]);
const SQLSTATE_CONEXAO = /^(08|57P0[1-3]$|53300$)/;   // conexão, shutdown do servidor, conexões esgotadas

export function isInfrastructureFailure(error) {
    if (ERROS_DE_CONEXAO.has(error?.name)) return true;
    const code = error?.original?.code ?? error?.parent?.code;
    return typeof code === 'string' && SQLSTATE_CONEXAO.test(code);
}

/**
 * Teto de devoluções por "banco fora" antes de contar tentativa (🟡-A). Bem abaixo do `delivery-limit`
 * padrão (20) da fila quorum: com 10, sobram as 5 tentativas do §5.3 com folga.
 */
export const MAX_INFRA_REDELIVERIES = 10;

/** Quantas vezes o broker já entregou esta mensagem nesta fila (cabeçalho da fila quorum). */
export function deliveryCount(msg) {
    return Number(msg.properties?.headers?.['x-delivery-count']) || 0;
}

/** ack/nack que nunca lança: com o canal fechado, o broker já devolveu a mensagem à fila. */
function semLancar(acao, logger, descricao) {
    try {
        acao();
    } catch (error) {
        logger.warn(`Analytics: ${descricao} perdido (${error.message}) — o broker reentrega; a idempotência cobre.`);
    }
}

/**
 * Handler de uma mensagem. `apply` e `parse` injetáveis para teste; em produção são os do catálogo.
 * NUNCA rejeita (qa-redteam H.2, 🟡-1): o amqplib não espera a promise do callback, e uma rejeição
 * sem tratamento encerra o processo no Node 24. Canal fechado no ack/nack só gera log.
 *
 * Falha de infraestrutura (banco fora): nem ack, nem nack — avisa o consumidor, que fecha a conexão.
 * O broker devolve as mensagens não confirmadas à fila SEM `x-death`, e nenhuma tentativa é gasta.
 */
export function createMessageHandler({ channel, apply = applyEvent, parse = parseEvent, logger = console, onInfrastructureFailure = () => {}, maxInfraRedeliveries = MAX_INFRA_REDELIVERIES }) {
    return async function handleMessage(msg) {
        if (msg === null) return;   // consumidor cancelado pelo broker (fila apagada)
        const attempts = previousFailures(msg) + 1;
        let event = null;
        try {
            event = parse(msg.content);
            await apply(event);
        } catch (error) {
            try {
                await tratarFalha({ channel, msg, event, error, attempts, logger, onInfrastructureFailure, maxInfraRedeliveries });
            } catch (inesperado) {
                logger.error(`Analytics: erro inesperado ao tratar falha (${inesperado.message}).`);
            }
            return;
        }
        // Depois do commit: canal fechado aqui não é falha do evento — a reentrega cai em 'duplicate'.
        semLancar(() => channel.ack(msg), logger, 'ack');
    };
}

async function tratarFalha({ channel, msg, event, error, attempts, logger, onInfrastructureFailure, maxInfraRedeliveries }) {
    // Log sem payload: o payload de hóspede tem o nome (LGPD) — só id e tipo.
    const quem = event ? `${event.type} ${event.eventId}` : `mensagem ${msg.properties?.messageId ?? '(sem id)'}`;

    // A pausa devolve a mensagem sem ack/nack, e cada devolução soma no `x-delivery-count` da fila quorum.
    // No `delivery-limit` (20 por padrão) o broker DESCARTA a mensagem — ciclo de dead-letter sem
    // 'rejected', fora da DLQ (reauditoria delta da H.2, 🟡-A). Por isso a pausa tem teto: acima dele, ou
    // se a mensagem já voltou uma vez da fila de espera, o erro de conexão conta como tentativa comum.
    if (isInfrastructureFailure(error) && previousFailures(msg) === 0 && deliveryCount(msg) < maxInfraRedeliveries) {
        logger.warn(`Analytics: ${quem} não aplicado — banco do analytics indisponível (${error.message}); pausando o consumo.`);
        onInfrastructureFailure(error);
        return;
    }

    const permanent = isPermanent(error);
    if (!permanent && attempts < MAX_ATTEMPTS) {
        logger.warn(`Analytics: ${quem} falhou (tentativa ${attempts}/${MAX_ATTEMPTS}): ${error.message}`);
        semLancar(() => channel.nack(msg, false, false), logger, 'nack');
        return;
    }
    try {
        await sendToDeadLetter(channel, msg, { error, attempts, permanent });
    } catch (erroDlq) {
        // Sem confirmação da DLQ não dá ack: a mensagem volta pela fila de espera e o
        // envio à DLQ é tentado de novo. Perder o evento é pior que repeti-lo.
        logger.error(`Analytics: falha ao enviar ${quem} à fila de mensagens mortas (${erroDlq.message}).`);
        semLancar(() => channel.nack(msg, false, false), logger, 'nack');
        return;
    }
    semLancar(() => channel.ack(msg), logger, 'ack');
    logger.error(`Analytics: ${quem} → fila de mensagens mortas (${permanent ? 'erro permanente' : `${attempts} tentativas`}): ${error.message}`);
}

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Laço de consumo com reconexão e espera crescente (1 s → 30 s), como o publicador do core.
 * `connect()` devolve `{ channel, closed: Promise, close() }`. `ready()` confere o banco antes de
 * consumir — sem as tabelas, toda mensagem iria parar na DLQ depois de 5 tentativas; e é por ele que
 * o consumo volta depois de uma pausa por banco fora do ar (🟡-3).
 *
 * A espera cresce só com falhas SEGUIDAS de `ready()`/`connect()`; quando o consumo volta, zera
 * (reauditoria delta, 🟢-C) — senão, depois de algumas quedas do banco, toda pausa esperaria 30 s.
 *
 * `status()`: 'stopped' | 'connecting' | 'consuming' — o /health usa (degradado → 503).
 * `stop()`: desligamento ordenado (SIGTERM) — cancela o consumo, espera as mensagens em andamento
 * terminarem (com ack) até `stopTimeoutMs`, e só então fecha a conexão. Interrompe também a espera do
 * backoff e não fica preso num `connect()`/`ready()` que não responde (🟢-B).
 */
export function createConsumer({
    connect, ready = async () => {}, apply, logger = console, sleep = defaultSleep,
    maxBackoffMs = 30000, stopTimeoutMs = 10000, maxInfraRedeliveries = MAX_INFRA_REDELIVERIES
}) {
    let running = false;
    let estado = 'stopped';
    let atual = null;
    let consumerTag = null;
    let laco = null;
    let acordar = null;
    const emAndamento = new Set();

    /**
     * Pausa por banco fora DRENANDO antes de fechar (reauditoria delta 2, 🟡-A2): cancela o consumo,
     * espera cada mensagem em andamento terminar a própria decisão (ack, nack acima do teto, ou pausa) e
     * só então fecha. Fechar na hora devolvia as vizinhas sem 'rejected' antes de decidirem — uma mensagem
     * lenta nunca chegava ao próprio teto e o broker a descartava na 21ª entrega. Assim, só volta sem nack
     * quem escolheu pausar, e cada mensagem pausa no máximo `maxInfraRedeliveries` vezes antes das 5
     * tentativas do §5.3. Uma vez por conexão: várias mensagens podem falhar juntas.
     *
     * O fechamento é ORDENADO (fecharComOrdem): canal primeiro, conexão depois. Fechar a conexão logo depois
     * dos nack/ack fazia o broker perder o nack recém-enviado da fila quorum — a mensagem voltava sem
     * `rejected` (comprovado com RabbitMQ real: 21 entregas e descarte). O `channel.close()` espera o
     * close-ok, e o broker liquida o que o canal enviou antes de encerrá-lo.
     */
    function pausarPorInfraestrutura() {
        if (!atual || atual.pausando) return;
        const conexao = atual;
        const tag = consumerTag;
        conexao.pausando = true;
        (async () => {
            if (tag) await conexao.channel.cancel(tag).catch(() => {});
            await comPrazo(Promise.allSettled([...emAndamento]), stopTimeoutMs);
            await fecharComOrdem(conexao);
        })();
    }

    /** Espera do backoff que o stop() interrompe. */
    function esperar(ms) {
        return Promise.race([sleep(ms), new Promise((resolve) => { acordar = resolve; })])
            .finally(() => { acordar = null; });
    }

    async function executar() {
        let backoff = 0;
        let ultimoErro = null;
        while (running) {
            try {
                estado = 'connecting';
                await ready();
                if (!running) break;
                atual = await connect();
                if (!running) {        // stop() chegou durante o connect(): fecha a conexão que chegou e sai
                    await atual.close().catch(() => {});
                    atual = null;
                    break;
                }
                await atual.channel.prefetch(PREFETCH);
                const handler = createMessageHandler({
                    channel: atual.channel, apply, logger,
                    onInfrastructureFailure: pausarPorInfraestrutura, maxInfraRedeliveries
                });
                const rastreado = (msg) => {
                    const p = handler(msg);
                    emAndamento.add(p);
                    p.finally(() => emAndamento.delete(p));
                    return p;
                };
                ({ consumerTag } = (await atual.channel.consume(QUEUE, rastreado, { noAck: false })) ?? {});
                estado = 'consuming';
                backoff = 0;           // 🟢-C: o consumo voltou — a próxima falha recomeça de 1 s
                logger.info(`Analytics: consumindo ${QUEUE} (prefetch ${PREFETCH}).`);
                ultimoErro = null;
                await atual.closed;   // fica aqui até a conexão cair (ou ser fechada pela pausa)
                if (running && !atual?.pausando) logger.warn('Analytics: conexão com o RabbitMQ caiu — reconectando.');
            } catch (error) {
                if (error.message !== ultimoErro) {
                    logger.warn(`Analytics: consumidor aguardando (${error.message}); tentando de novo.`);
                    ultimoErro = error.message;
                }
            }
            if (atual) {
                const fechar = atual;
                atual = null;
                consumerTag = null;
                await fechar.close().catch(() => {});
            }
            if (!running) break;
            estado = 'connecting';
            backoff = backoff ? Math.min(backoff * 2, maxBackoffMs) : Math.min(1000, maxBackoffMs);
            await esperar(backoff);
        }
        estado = 'stopped';
    }

    function start() {
        running = true;
        laco = executar();
        return laco;
    }

    async function stop() {
        running = false;
        acordar?.();
        const conexao = atual;
        if (conexao) {
            if (consumerTag) await conexao.channel.cancel(consumerTag).catch(() => {});
            await comPrazo(Promise.allSettled([...emAndamento]), stopTimeoutMs);
            await fecharComOrdem(conexao);   // o ack da última mensagem não se perde no fechamento
        }
        // connect()/ready() que não responde não segura o desligamento além do prazo.
        if (laco) await comPrazo(laco, stopTimeoutMs);
        estado = 'stopped';
    }

    return { start, stop, status: () => estado };
}

/** Canal primeiro (espera o close-ok, o broker liquida os ack/nack enviados), conexão depois. */
async function fecharComOrdem(conexao) {
    try {
        await conexao.channel.close();
    } catch {
        // canal já fechado (ou objeto de teste sem close): segue para a conexão
    }
    await conexao.close().catch(() => {});
}

async function comPrazo(promessa, ms) {
    let prazo;
    await Promise.race([promessa, new Promise((resolve) => { prazo = setTimeout(resolve, ms); })]);
    clearTimeout(prazo);
}

/**
 * Conexão real com a credencial do ANALYTICS (§8): lê a própria fila e publica só na DLX.
 * Canal de confirmação — o envio à DLQ só é dado como feito quando o broker grava.
 */
export function rabbitConnectFromEnv(env = process.env) {
    return async () => {
        const { connect } = await import('amqplib');
        const conn = await connect({
            protocol: 'amqp',
            hostname: env.RABBITMQ_HOST,
            port: Number(env.RABBITMQ_PORT || 5672),
            username: env.RABBITMQ_ANALYTICS_USER,
            password: env.RABBITMQ_ANALYTICS_PASSWORD,
            heartbeat: 30
        });
        const closed = new Promise((resolve) => conn.once('close', resolve));
        conn.on('error', () => {});   // o 'close' que vem junto já aciona a reconexão
        const channel = await conn.createConfirmChannel();
        channel.on('error', () => {});
        channel.once('close', () => conn.close().catch(() => {}));
        return { channel, closed, close: () => conn.close() };
    };
}

/** Liga o consumidor quando o RabbitMQ está configurado; senão, avisa e não faz nada. */
export function startConsumerFromEnv({ env = process.env, ready, logger = console } = {}) {
    if (!env.RABBITMQ_HOST) {
        logger.info('Analytics: RABBITMQ_HOST não configurado — consumidor desligado.');
        return null;
    }
    if (!env.RABBITMQ_ANALYTICS_USER || !env.RABBITMQ_ANALYTICS_PASSWORD) {
        logger.error('Analytics: RABBITMQ_ANALYTICS_USER/RABBITMQ_ANALYTICS_PASSWORD ausentes — consumidor desligado.');
        return null;
    }
    const consumer = createConsumer({ connect: rabbitConnectFromEnv(env), ready, logger });
    consumer.start();
    return consumer;
}
