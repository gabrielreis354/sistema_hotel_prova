import crypto from 'crypto';
import { registry } from '../../utils/metrics.js';

/**
 * GET /metrics — exposição no formato do Prometheus (RNF-029). Mesmo contrato do core.
 *
 * Não é público: o contador por tenant revela o volume de cada hotel. Exige
 * `Authorization: Bearer <METRICS_TOKEN>`, o mesmo token do core e do scrape do Prometheus.
 * Fail-closed: sem METRICS_TOKEN no ambiente, toda requisição é recusada. O nginx só roteia
 * /analytics/ para este serviço, então /metrics nem chega aqui de fora; o Prometheus fala direto.
 */
export default async function GetMetricsController(request, response) {
    try {
        const token = process.env.METRICS_TOKEN;
        if (!token) {
            console.error('GetMetricsController: METRICS_TOKEN não configurado — recusando (fail-closed)');
            return response.status(503).json({ error: 'Métricas não configuradas' });
        }

        const expected = Buffer.from(`Bearer ${token}`);
        const received = Buffer.from(request.get('authorization') || '');
        // Tamanho conferido antes: timingSafeEqual lança erro com buffers de tamanhos diferentes.
        if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) {
            return response.status(401).json({ error: 'Não autorizado' });
        }

        response.set('Content-Type', registry.contentType);
        return response.status(200).send(await registry.metrics());
    } catch (error) {
        console.error('GetMetricsController:', error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
