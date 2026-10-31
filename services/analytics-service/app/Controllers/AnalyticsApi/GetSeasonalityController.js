import select from '../../utils/select.js';
import { readIntInRange } from '../../utils/queryParams.js';

/**
 * GET /analytics/seasonality — reservas, receita e noites médias por mês de check-in
 * (ADMIN e RECEPTIONIST). Receita em NUMERIC (string); noites médias não é dinheiro e segue número.
 */
export default async function GetSeasonalityController(request, response) {
    try {
        const tenantId = request.tenantId;
        const { error, value: months } = readIntInRange(request.query.months, { name: 'months', min: 1, max: 60, fallback: 12 });
        if (error) return response.status(400).json({ error });

        const rows = await select(`
            SELECT TO_CHAR(DATE_TRUNC('month', check_in_date), 'YYYY-MM')        AS month,
                   COUNT(*)::int                                                  AS reservations,
                   COALESCE(SUM(total_amount), 0)::numeric(14,2)                  AS revenue,
                   ROUND(AVG(check_out_date - check_in_date)::numeric, 1)::float  AS avg_nights
              FROM proj_reservations
             WHERE tenant_id = :tenantId
               AND status <> 'CANCELLED'
               AND deleted_at IS NULL
               AND check_in_date >= DATE_TRUNC('month', NOW() - make_interval(months => :months))
             GROUP BY 1
             ORDER BY 1
        `, { tenantId, months });

        return response.json(rows);
    } catch (error) {
        console.error('GetSeasonalityController:', error.message);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
