import client from 'prom-client';

/**
 * Métricas Prometheus do core-service (T-02.4).
 *
 * Registry próprio, não o global do prom-client: o módulo é avaliado uma vez por
 * processo e a suíte de testes roda com isolate:false — um registry global somaria
 * registros duplicados entre arquivos de teste e lançaria erro.
 *
 * Rótulos com cardinalidade controlada: `route` é o PADRÃO da rota (/reservations/:id),
 * nunca o caminho cru — senão cada UUID viraria uma série nova e o Prometheus
 * estouraria memória. Rota que não casou com nada vira `unmatched`.
 */
export const registry = new client.Registry();
registry.setDefaultLabels({ service: 'core-service' });

// CPU, memória, event loop lag, GC — métricas técnicas do processo Node.
client.collectDefaultMetrics({ register: registry });

// Latência por endpoint. O _count deste histograma já dá vazão e, filtrado por
// status_code=~"5..", a taxa de erro — não precisa de um counter separado.
export const httpRequestDuration = new client.Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duração das requisições HTTP, por rota (padrão), método e status',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [registry]
});

// Uso por hotel — só requisições autenticadas (tenant vindo do JWT via tenantMiddleware).
// Cardinalidade = número de tenants, que é limitado. tenant_id é UUID, não dado pessoal,
// mas revela o volume de cada hotel: por isso /metrics não é público (ver metricsAuth).
export const httpRequestsByTenant = new client.Counter({
    name: 'http_requests_by_tenant_total',
    help: 'Requisições HTTP autenticadas, por tenant',
    labelNames: ['tenant_id'],
    registers: [registry]
});

/**
 * Padrão da rota que atendeu a requisição, com cardinalidade limitada.
 * - casou com uma rota: mount + padrão  → /reservations/:id/check-in
 * - barrada antes da rota (ex.: 401 do auth) dentro de um router montado → /reservations/*
 * - não casou com nada → unmatched (scanners batendo em /wp-admin não criam séries)
 */
export function routeLabel(request) {
    // O mount do motor de reserva tem parâmetro (/public/:subdomain); baseUrl traz o valor
    // real, então volta ao padrão para não criar uma série por subdomínio.
    const base = (request.baseUrl || '').replace(/^\/public\/[^/]+/, '/public/:subdomain');
    if (request.route?.path) {
        return base + request.route.path;
    }
    return base ? `${base}/*` : 'unmatched';
}
