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
export function createMessageHandler({ channel, apply = applyEvent, parse = parseEvent, logger = console, onInfrastructureFailure = () => {} }) {
    return async function handleMessage(msg) {
        if (msg === null) return;   // consumidor cancelado pelo broker (fila apagada)
        const attempts = previousFailures(msg) + 1;
        let event = null;
        try {
            event = parse(msg.content);
            await apply(event);
        } catch (error) {
            try {
                await tratarFalha({ channel, msg, event, error, attempts, logger, onInfrastructureFailure });
            } catch (inesperado) {
                logger.error(`Analytics: erro inesperado ao tratar falha (${inesperado.message}).`);
            }
            return;
        }
        // Depois do commit: canal fechado aqui não é falha do evento — a reentrega cai em 'duplicate'.
        semLancar(() => channel.ack(msg), logger, 'ack');
    };
}

async function tratarFalha({ channel, msg, event, error, attempts, logger, onInfrastructureFailure }) {
    // Log sem payload: o payload de hóspede tem o nome (LGPD) — só id e tipo.
    const quem = event ? `${event.type} ${event.eventId}` : `mensagem ${msg.properties?.messageId ?? '(sem id)'}`;

    if (isInfrastructureFailure(error)) {
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
 * `status()`: 'stopped' | 'connecting' | 'consuming' — o /health usa (degradado → 503).
 * `stop()`: desligamento ordenado (SIGTERM) — cancela o consumo, espera as mensagens em andamento
 * terminarem (com ack) até `stopTimeoutMs`, e só então fecha a conexão.
 */
export function createConsumer({ connect, ready = async () => {}, apply, logger = console, sleep = defaultSleep, maxBackoffMs = 30000, stopTimeoutMs = 10000 }) {
    let running = false;
    let estado = 'stopped';
    let atual = null;
    let consumerTag = null;
    let laco = null;
    const emAndamento = new Set();

    function pausarPorInfraestrutura() {
        // Uma vez por conexão: várias mensagens podem falhar juntas.
        if (!atual || atual.pausando) return;
        atual.pausando = true;
        atual.close().catch(() => {});
    }

    async function executar() {
        let backoff = 0;
        let ultimoErro = null;
        while (running) {
            try {
                estado = 'connecting';
                await ready();
                atual = await connect();
                await atual.channel.prefetch(PREFETCH);
                const handler = createMessageHandler({ channel: atual.channel, apply, logger, onInfrastructureFailure: pausarPorInfraestrutura });
                const rastreado = (msg) => {
                    const p = handler(msg);
                    emAndamento.add(p);
                    p.finally(() => emAndamento.delete(p));
                    return p;
                };
                ({ consumerTag } = (await atual.channel.consume(QUEUE, rastreado, { noAck: false })) ?? {});
                estado = 'consuming';
                logger.info(`Analytics: consumindo ${QUEUE} (prefetch ${PREFETCH}).`);
                ultimoErro = null;
                await atual.closed;   // fica aqui até a conexão cair (ou ser fechada pela pausa)
                const pausado = Boolean(atual?.pausando);
                if (running && !pausado) logger.warn('Analytics: conexão com o RabbitMQ caiu — reconectando.');
                if (!pausado) backoff = 0;
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
            backoff = backoff ? Math.min(backoff * 2, maxBackoffMs) : 1000;
            await sleep(backoff);
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
        const conexao = atual;
        if (conexao) {
            if (consumerTag) await conexao.channel.cancel(consumerTag).catch(() => {});
            let prazo;
            await Promise.race([
                Promise.allSettled([...emAndamento]),
                new Promise((resolve) => { prazo = setTimeout(resolve, stopTimeoutMs); })
            ]);
            clearTimeout(prazo);
            await conexao.close().catch(() => {});
        }
        if (laco) await laco;
        estado = 'stopped';
    }

    return { start, stop, status: () => estado };
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
