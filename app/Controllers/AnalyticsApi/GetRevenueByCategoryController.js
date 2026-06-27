import sequelize from '../../../database/connections/sequelize.js';
import { QueryTypes } from 'sequelize';

export default async function GetRevenueByCategoryController(request, response) {
    try {
        const tenantId = request.user.tenantId;
        const { start, end } = request.query;

        const dateFilter = start && end
            ? 'AND r.check_in_date BETWEEN :start AND :end'
            : '';

        const rows = await sequelize.query(`
            SELECT
                rc.name                                   AS category,
                COUNT(r.id)::int                          AS reservations,
                COALESCE(SUM(r.total_amount), 0)::float   AS revenue,
                CASE
                    WHEN COUNT(r.id) > 0
                    THEN (SUM(r.total_amount) / COUNT(r.id))::float
                    ELSE 0
                END                                       AS avg_ticket
            FROM reservations r
            JOIN rooms rm ON rm.id = r.room_id
            JOIN room_categories rc ON rc.id = rm.room_category_id
            WHERE r.tenant_id = :tenantId
              AND r.status NOT IN ('CANCELLED')
              AND r.deleted_at IS NULL
              ${dateFilter}
            GROUP BY rc.name
            ORDER BY revenue DESC
        `, {
            replacements: { tenantId, start: start ?? null, end: end ?? null },
            type: QueryTypes.SELECT
        });

        return response.json(rows);
    } catch (error) {
        console.error('GetRevenueByCategoryController:', error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
