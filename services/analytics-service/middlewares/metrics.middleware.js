import { httpRequestDuration, httpRequestsByTenant, routeLabel } from '../app/utils/metrics.js';

/**
 * Mede toda requisição ao terminar a resposta, quando já se sabe a rota, o status e — se
 * autenticada — o tenant. Mesmo comportamento do core (services/core-service/middlewares/metrics.middleware.js).
 *
 * O scrape do Prometheus (/metrics) não é medido: roda a cada 15 s e dominaria a vazão do painel.
 */
export default function metricsMiddleware(request, response, next) {
    if (request.path === '/metrics') {
        return next();
    }

    const stopTimer = httpRequestDuration.startTimer();
    let recorded = false;

    // `close` sem resposta terminada = o cliente desistiu: registrado como 499, senão as lentidões
    // sumiam do p95. Registro único, venha o evento que vier primeiro.
    const record = (statusCode) => {
        if (recorded) return;
        recorded = true;
        stopTimer({
            method: request.method,
            route: routeLabel(request),
            status_code: statusCode
        });

        if (request.tenantId) {
            httpRequestsByTenant.inc({ tenant_id: request.tenantId });
        }
    };

    response.once('finish', () => record(String(response.statusCode)));
    response.once('close', () => {
        if (!response.writableFinished) record('499');
    });

    next();
}
