import sequelize from '../../../database/connections/sequelize.js';
import { QueryTypes } from 'sequelize';

export default async function GetPaymentMixController(request, response) {
    try {
        const tenantId = request.user.tenantId;
        const { start, end } = request.query;

        const dateFilter = start && end
            ? 'AND paid_at::date BETWEEN :start AND :end'
            : '';

        const rows = await sequelize.query(`
            SELECT
                method,
                COUNT(*)::int                       AS count,
                COALESCE(SUM(amount), 0)::float     AS total,
                ROUND(
                    100.0 * SUM(amount) / NULLIF(SUM(SUM(amount)) OVER (), 0),
                    2
                )::float                            AS pct
            FROM payments
            WHERE tenant_id = :tenantId
              AND paid_at IS NOT NULL
              ${dateFilter}
            GROUP BY method
            ORDER BY total DESC
        `, {
            replacements: { tenantId, start: start ?? null, end: end ?? null },
            type: QueryTypes.SELECT
        });

        return response.json(rows);
    } catch (error) {
        console.error('GetPaymentMixController:', error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
