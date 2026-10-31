import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import pg from 'pg';
import { QueryTypes } from 'sequelize';
import sequelize from '../../database/connections/sequelize.js';
import { createOutboxPublisher, rabbitConnectFromEnv } from '../../app/services/outbox/publisher.js';

/**
 * Pipeline real para os testes de indicadores (T-01.4/H.3, CA-01.4.p): o core grava o outbox, o
 * publicador entrega ao RabbitMQ, o analytics-service (processo próprio, banco próprio) consome e
 * responde /analytics/*. Os testes semeiam pelo core e leem do analytics.
 *
 * Precisa de RabbitMQ com a topologia de infra/k8s/rabbitmq-setup.sh e das variáveis do
 * .env.test.example (RABBITMQ_*). Sem elas, `pipelineConfigured` é falso e o arquivo é pulado —
 * como o teste de integração do analytics (o CI do core ainda não tem broker: pendência do Weslley).
 */
const ANALYTICS_DIR = resolve(process.cwd(), '../analytics-service');
// Database à parte no mesmo PostgreSQL de teste: não colide com o gesway_analytics_test da suíte do
// analytics nem com o gestao_hotel_test do core. Recriado a cada rodada.
const ANALYTICS_DB = 'gesway_analytics_pipeline_test';
const QUEUE = 'analytics.core-events';

const env = process.env;
export const pipelineConfigured = Boolean(
    env.RABBITMQ_HOST && env.RABBITMQ_CORE_PASSWORD && env.RABBITMQ_ANALYTICS_PASSWORD
);

const port = Number(env.ANALYTICS_PIPELINE_PORT || 3063);
export const analyticsUrl = `http://127.0.0.1:${port}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Só o que o analytics precisa — nada da chave privada nem do resto do ambiente do core.
function analyticsEnv() {
    return {
        PATH: env.PATH,
        NODE_ENV: 'test',
        NODE_WEB_PORT: String(port),
        POSTGRES_HOST: env.POSTGRES_HOST,
        POSTGRES_PORT: env.POSTGRES_PORT,
        POSTGRES_DB: ANALYTICS_DB,
        POSTGRES_USER: env.POSTGRES_USER,
        POSTGRES_PASSWORD: env.POSTGRES_PASSWORD,
        JWT_PUBLIC_KEY_PATH: resolve(process.cwd(), env.JWT_PUBLIC_KEY_PATH),
        RABBITMQ_HOST: env.RABBITMQ_HOST,
        RABBITMQ_PORT: env.RABBITMQ_PORT,
        RABBITMQ_ANALYTICS_USER: env.RABBITMQ_ANALYTICS_USER,
        RABBITMQ_ANALYTICS_PASSWORD: env.RABBITMQ_ANALYTICS_PASSWORD
    };
}

async function recreateDatabase() {
    const admin = new pg.Client({
        host: env.POSTGRES_HOST, port: Number(env.POSTGRES_PORT),
        user: env.POSTGRES_USER, password: env.POSTGRES_PASSWORD, database: 'postgres'
    });
    await admin.connect();
    try {
        await admin.query(`DROP DATABASE IF EXISTS ${ANALYTICS_DB} WITH (FORCE)`);
        await admin.query(`CREATE DATABASE ${ANALYTICS_DB}`);
    } finally {
        await admin.end();
    }
}

/** Esvazia a fila do analytics: mensagem de rodada anterior não cai no banco recém-criado. */
async function purgeQueue() {
    const { connect } = await import('amqplib');
    const conn = await connect({
        protocol: 'amqp', hostname: env.RABBITMQ_HOST, port: Number(env.RABBITMQ_PORT || 5672),
        username: env.RABBITMQ_ANALYTICS_USER, password: env.RABBITMQ_ANALYTICS_PASSWORD
    });
    try {
        const channel = await conn.createChannel();
        await channel.purgeQueue(QUEUE);
        await channel.close();
    } finally {
        await conn.close();
    }
}

function run(args) {
    return new Promise((ok, fail) => {
        const child = spawn(process.execPath, args, { cwd: ANALYTICS_DIR, env: analyticsEnv(), stdio: 'pipe' });
        let output = '';
        child.stdout.on('data', (d) => { output += d; });
        child.stderr.on('data', (d) => { output += d; });
        child.on('exit', (code) => (code === 0 ? ok(output) : fail(new Error(`analytics ${args.join(' ')} saiu com ${code}: ${output}`))));
    });
}

/**
 * Sobe o pipeline: banco do analytics limpo, migrate, processo do analytics consumindo e o
 * publicador do outbox do core rodando neste processo. Devolve `stop()`.
 */
export async function startPipeline() {
    await recreateDatabase();
    await purgeQueue();
    await run(['command.js', 'migrate']);

    let output = '';
    const child = spawn(process.execPath, ['_web.js'], { cwd: ANALYTICS_DIR, env: analyticsEnv(), stdio: 'pipe' });
    child.stdout.on('data', (d) => { output += d; });
    child.stderr.on('data', (d) => { output += d; });

    // Pronto = /health 200 (banco no ar e consumidor consumindo a fila).
    const prazo = Date.now() + 30000;
    for (;;) {
        if (child.exitCode !== null) throw new Error(`analytics-service saiu antes de ficar pronto: ${output}`);
        try {
            const res = await fetch(`${analyticsUrl}/health`);
            if (res.status === 200) break;
        } catch { /* ainda subindo */ }
        if (Date.now() > prazo) {
            child.kill('SIGKILL');
            throw new Error(`analytics-service não ficou pronto em 30 s: ${output}`);
        }
        await sleep(200);
    }

    const publisher = createOutboxPublisher({ connect: rabbitConnectFromEnv(env), intervalMs: 100, logger: { info() {}, warn() {}, error() {} } });
    const running = publisher.start();

    return {
        async stop() {
            publisher.stop();
            await running;
            const saiu = new Promise((r) => child.once('exit', r));
            child.kill('SIGTERM');
            await Promise.race([saiu, sleep(5000)]);
            if (child.exitCode === null) child.kill('SIGKILL');
        }
    };
}

/** GET no analytics-service com o JWT emitido pelo core. */
export async function analyticsGet(path, token) {
    const res = await fetch(`${analyticsUrl}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    const text = await res.text();
    let body;
    try { body = JSON.parse(text); } catch { body = text; }
    return { status: res.status, body };
}

/**
 * Espera o consumo de TUDO o que o core gravou até agora: cada linha do outbox (truncado no início
 * do arquivo; o banco do analytics é recriado) vira exatamente uma linha em processed_events do
 * analytics, com ou sem efeito na projeção (§5.2). Contagens iguais = nada em trânsito, e a
 * ausência de uma linha num indicador passa a significar alguma coisa. Evento que fosse para a
 * fila de mensagens mortas nunca entraria em processed_events → o teste falha por prazo.
 */
export async function waitForConsumption({ timeoutMs = 20000 } = {}) {
    const analyticsDb = new pg.Client({
        host: env.POSTGRES_HOST, port: Number(env.POSTGRES_PORT),
        user: env.POSTGRES_USER, password: env.POSTGRES_PASSWORD, database: ANALYTICS_DB
    });
    await analyticsDb.connect();
    try {
        const prazo = Date.now() + timeoutMs;
        let gravados = 0;
        let processados = 0;
        while (Date.now() <= prazo) {
            [{ gravados }] = await sequelize.query('SELECT COUNT(*)::int AS gravados FROM outbox', { type: QueryTypes.SELECT });
            ({ rows: [{ processados }] } = await analyticsDb.query('SELECT COUNT(*)::int AS processados FROM processed_events'));
            if (gravados === processados) return;
            await sleep(100);
        }
        throw new Error(`analytics não consumiu tudo em ${timeoutMs} ms: outbox ${gravados}, processados ${processados}`);
    } finally {
        await analyticsDb.end();
    }
}
