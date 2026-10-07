import { httpRequestDuration, httpRequestsByTenant, routeLabel } from '../app/utils/metrics.js';

/**
 * Mede toda requisição ao terminar a resposta (evento `finish`), quando já se sabe
 * a rota que atendeu, o status e — se autenticada — o tenant.
 *
 * O próprio scrape do Prometheus (/metrics) não é medido: ele roda a cada poucos
 * segundos e dominaria a vazão e a latência do dashboard sem dizer nada do hotel.
 */
export default function metricsMiddleware(request, response, next) {
    if (request.path === '/metrics') {
        return next();
    }

    const stopTimer = httpRequestDuration.startTimer();

    response.on('finish', () => {
        stopTimer({
            method: request.method,
            route: routeLabel(request),
            status_code: String(response.statusCode)
        });

        if (request.tenantId) {
            httpRequestsByTenant.inc({ tenant_id: request.tenantId });
        }
    });

    next();
}
