import sequelize from '../../../database/connections/sequelize.js';
import { QueryTypes } from 'sequelize';

export default async function GetTopGuestsController(request, response) {
    try {
        const tenantId = request.user.tenantId;
        const limit = parseInt(request.query.limit ?? '10', 10);

        if (isNaN(limit) || limit < 1 || limit > 100) {
            return response.status(400).json({ error: 'limit deve ser um número entre 1 e 100' });
        }

        const rows = await sequelize.query(`
            SELECT
                g.id                                      AS guest_id,
                g.full_name,
                g.email,
                COUNT(r.id)::int                          AS total_reservations,
                COALESCE(SUM(r.total_amount), 0)::float   AS lifetime_value,
                MAX(r.check_out_date)                     AS last_stay
            FROM guests g
            JOIN reservations r ON r.guest_id = g.id
            WHERE g.tenant_id = :tenantId
              AND r.tenant_id = :tenantId
              AND r.status NOT IN ('CANCELLED')
              AND r.deleted_at IS NULL
              AND g.deleted_at IS NULL
            GROUP BY g.id, g.full_name, g.email
            ORDER BY lifetime_value DESC
            LIMIT :limit
        `, {
            replacements: { tenantId, limit },
            type: QueryTypes.SELECT
        });

        return response.json(rows);
    } catch (error) {
        console.error('GetTopGuestsController:', error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
