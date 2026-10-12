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
    let recorded = false;

    // `finish` = resposta entregue. `close` sem resposta terminada = o cliente desistiu (timeout,
    // aba fechada): registrado como 499, senão os 504 e as lentidões sumiam do p95 e da taxa de
    // erro (qa-redteam de 12/10). Registro único, venha o evento que vier primeiro.
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
