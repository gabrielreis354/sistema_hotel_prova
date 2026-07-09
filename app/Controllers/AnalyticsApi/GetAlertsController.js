import sequelize from '../../../database/connections/sequelize.js';
import { QueryTypes } from 'sequelize';

export default async function GetAlertsController(request, response) {
    try {
        const tenantId = request.user.tenantId;

        const noShowRisk = await sequelize.query(`
            SELECT
                r.id              AS reservation_id,
                g.full_name       AS guest,
                g.phone           AS guest_phone,
                r.check_in_date,
                r.total_amount::float AS amount
            FROM reservations r
            JOIN guests g ON g.id = r.guest_id
            LEFT JOIN payments p ON p.reservation_id = r.id AND p.tenant_id = :tenantId
            WHERE r.tenant_id = :tenantId
              AND r.status = 'CONFIRMED'
              AND r.check_in_date = CURRENT_DATE
              AND r.deleted_at IS NULL
              AND p.id IS NULL
            ORDER BY r.total_amount DESC
        `, {
            replacements: { tenantId },
            type: QueryTypes.SELECT
        });

        const cleaningPending = await sequelize.query(`
            SELECT
                r.id          AS room_id,
                r.number      AS room_number,
                rc.name       AS category,
                r.updated_at  AS cleaning_since
            FROM rooms r
            JOIN room_categories rc ON rc.id = r.category_id
            WHERE r.tenant_id = :tenantId
              AND r.status = 'CLEANING'
              AND r.deleted_at IS NULL
            ORDER BY r.updated_at
        `, {
            replacements: { tenantId },
            type: QueryTypes.SELECT
        });

        const pendingTooLong = await sequelize.query(`
            SELECT
                r.id              AS reservation_id,
                g.full_name       AS guest,
                r.check_in_date,
                r.total_amount::float AS amount,
                r.created_at,
                EXTRACT(EPOCH FROM (NOW() - r.created_at)) / 3600 AS hours_pending
            FROM reservations r
            JOIN guests g ON g.id = r.guest_id
            WHERE r.tenant_id = :tenantId
              AND r.status = 'PENDING'
              AND r.created_at < NOW() - INTERVAL '48 hours'
              AND r.deleted_at IS NULL
            ORDER BY r.created_at
        `, {
            replacements: { tenantId },
            type: QueryTypes.SELECT
        });

        return response.json({
            no_show_risk: noShowRisk,
            cleaning_pending: cleaningPending,
            pending_too_long: pendingTooLong
        });
    } catch (error) {
        console.error('GetAlertsController:', error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
