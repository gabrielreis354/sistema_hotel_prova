import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'crypto';
import createApp from '../bootstrap/createApp.js';
import { parseEvent } from '../app/events/catalog.js';
import applyEvent from '../app/events/applyEvent.js';
import { createMessageHandler } from '../app/consumer/consumer.js';
import { PermanentEventError } from '../app/events/catalog.js';
import { envelope, toBuffer, truncateAll, tokenFor } from './helpers/events.js';

// RNF-029 (Doc 02): todo serviço expõe GET /metrics. Mesmo contrato do core (T-02.4,
// services/core-service/tests/metrics.test.js): formato do Prometheus, protegido por METRICS_TOKEN,
// fail-closed. É o que faz o analytics aparecer no Grafana do passo 8 (🔴-7 da revisão de 19/11).
const app = createApp();
const METRICS_TOKEN = 'metrics_token_de_teste';
const silencioso = { info: () => {}, warn: () => {}, error: () => {} };
let tenantId;
let jwt;

async function scrape() {
    const res = await request(app).get('/metrics').set('Authorization', `Bearer ${METRICS_TOKEN}`);
    expect(res.status).toBe(200);
    return res.text;
}

function canalFalso() {
    return { ack: vi.fn(), nack: vi.fn(), publish: vi.fn(() => true), waitForConfirms: vi.fn(async () => {}) };
}
const mensagem = (conteudo) => ({
    content: conteudo,
    properties: { messageId: randomUUID(), contentType: 'application/json', type: 'tenant.created', headers: {} }
});

// Valor de uma série do contador de eventos no texto do scrape (0 se ainda não existe).
function eventos(text, outcome) {
    const linha = text.split('\n').find((l) => l.startsWith('analytics_events_total{') && l.includes(`outcome="${outcome}"`));
    return linha ? Number(linha.split(' ').pop()) : 0;
}

beforeAll(async () => {
    await truncateAll();
    tenantId = randomUUID();
    await applyEvent(parseEvent(toBuffer(envelope('tenant.created', { tenantId, aggregateId: tenantId, payload: { status: 'ACTIVE' } }))));
    jwt = tokenFor({ tenantId });
});

afterEach(() => {
    vi.unstubAllEnvs();
});

describe('GET /metrics — acesso', () => {
    it('sem METRICS_TOKEN no ambiente recusa toda requisição (fail-closed)', async () => {
        vi.stubEnv('METRICS_TOKEN', '');
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        try {
            const res = await request(app).get('/metrics').set('Authorization', 'Bearer qualquer');
            expect(res.status).toBe(503);
            expect(res.text).not.toContain('http_request_duration_seconds');
        } finally {
            errorSpy.mockRestore();
        }
    });

    it('sem cabeçalho Authorization retorna 401', async () => {
        vi.stubEnv('METRICS_TOKEN', METRICS_TOKEN);
        const res = await request(app).get('/metrics');
        expect(res.status).toBe(401);
    });

    it('com token errado retorna 401', async () => {
        vi.stubEnv('METRICS_TOKEN', METRICS_TOKEN);
        const res = await request(app).get('/metrics').set('Authorization', 'Bearer token_errado');
        expect(res.status).toBe(401);
    });

    it('o JWT de um usuário do hotel não abre /metrics', async () => {
        vi.stubEnv('METRICS_TOKEN', METRICS_TOKEN);
        const res = await request(app).get('/metrics').set('Authorization', `Bearer ${jwt}`);
        expect(res.status).toBe(401);
    });

    it('com o token certo devolve o formato do Prometheus, rotulado como analytics-service', async () => {
        vi.stubEnv('METRICS_TOKEN', METRICS_TOKEN);
        const res = await request(app).get('/metrics').set('Authorization', `Bearer ${METRICS_TOKEN}`);

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toContain('text/plain');
        expect(res.text).toContain('process_cpu_seconds_total');
        expect(res.text).toContain('service="analytics-service"');
    });

    it.each(['/METRICS', '/Metrics', '/metrics/'])('%s não serve as métricas, nem com o token certo', async (caminho) => {
        vi.stubEnv('METRICS_TOKEN', METRICS_TOKEN);
        const res = await request(app).get(caminho).set('Authorization', `Bearer ${METRICS_TOKEN}`);

        expect(res.status).toBe(404);
        expect(res.text).not.toContain('http_request_duration_seconds');
    });
});

describe('GET /metrics — requisições HTTP', () => {
    it('mede a latência pelo padrão da rota, com método e status', async () => {
        vi.stubEnv('METRICS_TOKEN', METRICS_TOKEN);
        await request(app).get('/analytics/revenue').set('Authorization', `Bearer ${jwt}`);

        const text = await scrape();
        expect(text).toMatch(/http_request_duration_seconds_count\{[^}]*method="GET"[^}]*route="\/analytics\/revenue"[^}]*status_code="200"/);
    });

    it('requisição barrada pelo auth fica no router montado, não em "unmatched"', async () => {
        vi.stubEnv('METRICS_TOKEN', METRICS_TOKEN);
        await request(app).get('/analytics/occupancy');

        const text = await scrape();
        expect(text).toMatch(/route="\/analytics\/\*"[^}]*status_code="401"/);
    });

    it('caixa diferente no mount não cria série nova', async () => {
        vi.stubEnv('METRICS_TOKEN', METRICS_TOKEN);
        await request(app).get('/ANALYTICS/xyz-unico-123');

        const text = await scrape();
        expect(text).not.toContain('ANALYTICS');
        expect(text).not.toContain('xyz-unico-123');
    });

    it('caminho que não existe vira "unmatched"', async () => {
        vi.stubEnv('METRICS_TOKEN', METRICS_TOKEN);
        await request(app).get('/wp-admin/setup-config.php');

        const text = await scrape();
        expect(text).toContain('route="unmatched"');
        expect(text).not.toContain('wp-admin');
    });

    it('conta requisições autenticadas por tenant', async () => {
        vi.stubEnv('METRICS_TOKEN', METRICS_TOKEN);
        await request(app).get('/analytics/alerts').set('Authorization', `Bearer ${jwt}`);

        const text = await scrape();
        expect(text).toMatch(new RegExp(`http_requests_by_tenant_total\\{[^}]*tenant_id="${tenantId}"[^}]*\\} [1-9]`));
    });

    it('o próprio scrape não é medido', async () => {
        vi.stubEnv('METRICS_TOKEN', METRICS_TOKEN);
        await scrape();

        const text = await scrape();
        expect(text).not.toContain('route="/metrics"');
    });
});

// O que prova os microsserviços no painel: os eventos do core chegando e sendo aplicados aqui.
describe('GET /metrics — eventos consumidos', () => {
    it('conta o evento aplicado e o repetido (idempotência)', async () => {
        vi.stubEnv('METRICS_TOKEN', METRICS_TOKEN);
        const antes = await scrape();
        const conteudo = toBuffer(envelope('guest.created', { tenantId, payload: { full_name: 'Hóspede Métrica' } }));
        const handler = createMessageHandler({ channel: canalFalso(), logger: silencioso });

        await handler(mensagem(conteudo));
        await handler(mensagem(conteudo));

        const depois = await scrape();
        expect(eventos(depois, 'applied') - eventos(antes, 'applied')).toBe(1);
        expect(eventos(depois, 'duplicate') - eventos(antes, 'duplicate')).toBe(1);
    });

    it('conta a nova tentativa e o envio à fila de mensagens mortas', async () => {
        vi.stubEnv('METRICS_TOKEN', METRICS_TOKEN);
        const antes = await scrape();
        const transitorio = Object.assign(new Error('deadlock'), { original: { code: '40P01' } });
        const conteudo = toBuffer(envelope('guest.created', { tenantId, payload: { full_name: 'Hóspede Retry' } }));

        await createMessageHandler({ channel: canalFalso(), apply: async () => { throw transitorio; }, logger: silencioso })(mensagem(conteudo));
        await createMessageHandler({ channel: canalFalso(), apply: async () => { throw new PermanentEventError('inválido'); }, logger: silencioso })(mensagem(conteudo));

        const depois = await scrape();
        expect(eventos(depois, 'retry') - eventos(antes, 'retry')).toBe(1);
        expect(eventos(depois, 'dead_letter') - eventos(antes, 'dead_letter')).toBe(1);
    });

    it('resultado fora da lista não cria série nova', async () => {
        vi.stubEnv('METRICS_TOKEN', METRICS_TOKEN);
        const conteudo = toBuffer(envelope('guest.created', { tenantId, payload: { full_name: 'Hóspede Outro' } }));
        await createMessageHandler({ channel: canalFalso(), apply: async () => 'resultado-inesperado', logger: silencioso })(mensagem(conteudo));

        const text = await scrape();
        expect(text).not.toContain('resultado-inesperado');
    });
});
