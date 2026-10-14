import { QueryTypes } from 'sequelize';
import sequelize from '../../../database/connections/sequelize.js';

/**
 * Publicador do outbox (T-01.4/H.1, CA-01.4.b e c) — contrato no catálogo de eventos v1.0 §5.4.
 *
 * Roda dentro de cada réplica do backend. A cada rodada pega um lote de eventos pendentes com
 * `FOR UPDATE SKIP LOCKED` (as 3 réplicas nunca pegam a mesma linha), publica na exchange do
 * core e só marca `published_at` depois que o broker CONFIRMA (publisher confirms). Sem
 * confirmação, a transação desfaz e o lote volta na próxima rodada — entrega PELO MENOS UMA
 * VEZ; a duplicata é problema do consumidor (§5.2, idempotência por event_id).
 *
 * Broker fora do ar: a API não depende disto — os eventos acumulam no outbox (CA-01.4.c) e o
 * publicador espera cada vez mais entre tentativas, até 30 s.
 */
export const EXCHANGE = 'gesway.core.events';

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function toEnvelope(row) {
    return {
        event_id: row.event_id,
        type: row.type,
        version: row.version,
        occurred_at: new Date(row.occurred_at).toISOString(),
        tenant_id: row.tenant_id,
        aggregate_id: row.aggregate_id,
        aggregate_version: Number(row.id),   // BIGSERIAL do outbox (§6); cabe em Number com folga
        payload: row.payload,
    };
}

/**
 * Espera a confirmação do broker com prazo. Em alarme de memória/disco o RabbitMQ BLOQUEIA o
 * publicador sem fechar a conexão: sem prazo, a réplica ficaria presa com a transação aberta e uma
 * conexão do pool segurada. Estourou → desfaz o lote, reconecta e tenta de novo, como outra falha.
 */
async function confirmWithin(channel, timeoutMs) {
    let timer;
    const prazo = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`broker não confirmou em ${timeoutMs} ms`)), timeoutMs);
    });
    try {
        await Promise.race([channel.waitForConfirms(), prazo]);
    } finally {
        clearTimeout(timer);
    }
}

export function createOutboxPublisher({
    connect,
    intervalMs = 1000,
    batchSize = 100,
    maxBackoffMs = 30000,
    confirmTimeoutMs = 10000,
    sleep = defaultSleep,
    logger = console,
} = {}) {
    let running = false;

    /** Publica um lote. Devolve quantos eventos saíram. Lança se o broker não confirmar. */
    async function publishPending(channel) {
        const transaction = await sequelize.transaction();
        try {
            const rows = await sequelize.query(
                `SELECT id, event_id, type, version, tenant_id, aggregate_id, payload, occurred_at
                   FROM outbox
                  WHERE published_at IS NULL
                  ORDER BY id
                  LIMIT :limit
                    FOR UPDATE SKIP LOCKED`,
                { replacements: { limit: batchSize }, type: QueryTypes.SELECT, transaction }
            );
            if (rows.length === 0) {
                await transaction.commit();
                return 0;
            }

            for (const row of rows) {
                channel.publish(EXCHANGE, row.type, Buffer.from(JSON.stringify(toEnvelope(row))), {
                    persistent: true,
                    contentType: 'application/json',
                    messageId: row.event_id,
                    type: row.type,
                });
            }
            await confirmWithin(channel, confirmTimeoutMs);

            await sequelize.query('UPDATE outbox SET published_at = now() WHERE id IN (:ids)', {
                replacements: { ids: rows.map((r) => r.id) },
                transaction,
            });
            await transaction.commit();
            return rows.length;
        } catch (error) {
            await transaction.rollback();
            throw error;
        }
    }

    /** Laço até `stop()`. Nunca lança: falha vira espera crescente e nova tentativa. */
    async function start() {
        running = true;
        let connection = null;
        let backoff = 0;
        let ultimoErro = null;

        while (running) {
            try {
                if (!connection) connection = await connect();
                const published = await publishPending(connection.channel);
                if (ultimoErro) logger.info('Outbox: publicação retomada.');
                backoff = 0;
                ultimoErro = null;
                if (published === batchSize) continue;   // ainda há fila: segue sem esperar
                await sleep(intervalMs);
            } catch (error) {
                // Uma linha por mudança de erro, não uma por tentativa — com o broker fora por
                // horas, o log não pode virar só isto.
                if (error.message !== ultimoErro) {
                    logger.warn(`Outbox: publicação falhou (${error.message}); eventos seguem acumulados e serão reenviados.`);
                    ultimoErro = error.message;
                }
                if (connection) {
                    await connection.close().catch(() => {});
                    connection = null;
                }
                backoff = backoff ? Math.min(backoff * 2, maxBackoffMs) : intervalMs;
                await sleep(backoff);
            }
        }
        if (connection) await connection.close().catch(() => {});
    }

    function stop() {
        running = false;
    }

    return { publishPending, start, stop };
}

/**
 * Conexão real com o RabbitMQ, com a credencial do CORE (só publica na própria exchange — §8).
 * Canal de confirmação: `waitForConfirms` só resolve quando o broker gravou a mensagem.
 */
export function rabbitConnectFromEnv(env = process.env) {
    return async () => {
        const { connect } = await import('amqplib');
        const conn = await connect({
            protocol: 'amqp',
            hostname: env.RABBITMQ_HOST,
            port: Number(env.RABBITMQ_PORT || 5672),
            username: env.RABBITMQ_CORE_USER,
            password: env.RABBITMQ_CORE_PASSWORD,
            heartbeat: 30,
        });
        // Erro de conexão já fecha o canal: o próximo publish/confirm falha e o laço reconecta.
        conn.on('error', () => {});
        const channel = await conn.createConfirmChannel();
        channel.on('error', () => {});
        return { channel, close: () => conn.close() };
    };
}

/** Liga o publicador quando o RabbitMQ está configurado; senão, avisa e não faz nada. */
export function startOutboxPublisherFromEnv(env = process.env, logger = console) {
    if (!env.RABBITMQ_HOST) {
        logger.info('Outbox: RABBITMQ_HOST não configurado — publicador desligado (eventos acumulam no outbox).');
        return null;
    }
    if (!env.RABBITMQ_CORE_USER || !env.RABBITMQ_CORE_PASSWORD) {
        logger.error('Outbox: RABBITMQ_CORE_USER/RABBITMQ_CORE_PASSWORD ausentes — publicador desligado.');
        return null;
    }
    const publisher = createOutboxPublisher({ connect: rabbitConnectFromEnv(env), logger });
    publisher.start();
    logger.info(`Outbox: publicando em ${env.RABBITMQ_HOST} → ${EXCHANGE}.`);
    return publisher;
}
