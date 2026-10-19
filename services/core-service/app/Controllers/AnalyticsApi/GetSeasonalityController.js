import sequelize from '../../../database/connections/sequelize.js';
import { QueryTypes } from 'sequelize';

export default async function GetSeasonalityController(request, response) {
    try {
        const tenantId = request.user.tenantId;
        const months = parseInt(request.query.months ?? '12', 10);

        if (isNaN(months) || months < 1 || months > 60) {
            return response.status(400).json({ error: 'months deve ser um número entre 1 e 60' });
        }

        const rows = await sequelize.query(`
            SELECT
                TO_CHAR(DATE_TRUNC('month', check_in_date), 'YYYY-MM') AS month,
                COUNT(*)::int                                           AS reservations,
                COALESCE(SUM(total_amount), 0)::float                  AS revenue,
                ROUND(AVG(check_out_date - check_in_date)::numeric, 1)::float AS avg_nights
            FROM reservations
            WHERE tenant_id = :tenantId
              AND status NOT IN ('CANCELLED')
              AND deleted_at IS NULL
              AND check_in_date >= DATE_TRUNC('month', NOW() - (:months || ' months')::interval)
            GROUP BY 1
            ORDER BY 1
        `, {
            replacements: { tenantId, months },
            type: QueryTypes.SELECT
        });

        return response.json(rows);
    } catch (error) {
        console.error('GetSeasonalityController:', error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
