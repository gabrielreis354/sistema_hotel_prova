import select from '../../utils/select.js';
import { readPeriod } from '../../utils/queryParams.js';

/**
 * GET /analytics/payment-mix — total e participação de cada meio de pagamento (ADMIN e
 * RECEPTIONIST). Só PAID: VOIDED (T-06.13) e excluído (D-2) ficam fora. `total` é dinheiro
 * (string NUMERIC); `pct` é percentual, não dinheiro, e segue número.
 */
export default async function GetPaymentMixController(request, response) {
    try {
        const tenantId = request.tenantId;
        const { error, period } = readPeriod(request.query);
        if (error) return response.status(400).json({ error });

        const dateFilter = period ? 'AND paid_at::date BETWEEN :start AND :end' : '';

        const rows = await select(`
            SELECT method,
                   COUNT(*)::int                AS count,
                   SUM(amount)::numeric(14,2)   AS total,
                   ROUND(100.0 * SUM(amount) / NULLIF(SUM(SUM(amount)) OVER (), 0), 2)::float AS pct
              FROM proj_payments
             WHERE tenant_id = :tenantId
               AND status = 'PAID' AND paid_at IS NOT NULL AND deleted_at IS NULL
               ${dateFilter}
             GROUP BY method
             ORDER BY SUM(amount) DESC, method
        `, { tenantId, start: period?.start ?? null, end: period?.end ?? null });

        return response.json(rows);
    } catch (error) {
        console.error('GetPaymentMixController:', error.message);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
