import client from 'prom-client';

/**
 * Métricas Prometheus do analytics-service (RNF-029 do Doc 02; 🔴-7 da revisão de 19/11).
 *
 * Mesmo desenho do core (services/core-service/app/utils/metrics.js, T-02.4), copiado e não
 * compartilhado: cada serviço tem o próprio package.json e o próprio deploy, e não há pacote comum
 * entre os backends. Mudou um, confira o outro.
 *
 * Registry próprio, não o global do prom-client: a suíte roda com isolate:false, e um registry
 * global somaria registros duplicados entre arquivos de teste.
 */
export const registry = new client.Registry();
registry.setDefaultLabels({ service: 'analytics-service' });

// CPU, memória, event loop lag, GC — métricas técnicas do processo Node.
client.collectDefaultMetrics({ register: registry });

// Latência por endpoint. O _count dá a vazão e, com status_code=~"5..", a taxa de erro.
export const httpRequestDuration = new client.Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duração das requisições HTTP, por rota (padrão), método e status',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [registry]
});

// Uso por hotel — só requisições autenticadas. Cardinalidade = número de tenants. Revela o volume
// de cada hotel: por isso /metrics não é público (ver GetMetricsController).
export const httpRequestsByTenant = new client.Counter({
    name: 'http_requests_by_tenant_total',
    help: 'Requisições HTTP autenticadas, por tenant',
    labelNames: ['tenant_id'],
    registers: [registry]
});

/**
 * Eventos do core tratados pelo consumidor, por resultado. É o painel que mostra, ao vivo, os dois
 * serviços conversando pelo RabbitMQ (C1): a recepção faz o check-in no core e o `applied` sobe aqui.
 * - applied / stale / duplicate: o que applyEvent devolveu (stale = versão mais velha que a projeção);
 * - retry: falha transitória, nack para a fila de espera;
 * - dead_letter: foi para a fila de mensagens mortas.
 * Allowlist: qualquer outro valor vira `other`, para nunca criar série nova.
 */
export const EVENT_OUTCOMES = ['applied', 'stale', 'duplicate', 'retry', 'dead_letter'];
export const eventsTotal = new client.Counter({
    name: 'analytics_events_total',
    help: 'Eventos do core tratados pelo consumidor do analytics, por resultado',
    labelNames: ['outcome'],
    registers: [registry]
});

export function countEvent(outcome) {
    eventsTotal.inc({ outcome: EVENT_OUTCOMES.includes(outcome) ? outcome : 'other' });
}

/**
 * Padrão da rota que atendeu a requisição, com cardinalidade limitada.
 * - casou com uma rota: mount + padrão → /analytics/revenue
 * - barrada antes da rota (401 do auth) dentro do router montado → /analytics/*
 * - não casou com nada → unmatched
 * Minúsculas: o Express casa o mount sem distinguir caixa, mas baseUrl guarda o texto como veio —
 * "/ANALYTICS/x" criaria uma série por grafia (qa-redteam do core, 12/10, 🔴-2).
 */
export function routeLabel(request) {
    const base = (request.baseUrl || '').toLowerCase();
    if (request.route?.path) {
        return base + request.route.path;
    }
    return base ? `${base}/*` : 'unmatched';
}
