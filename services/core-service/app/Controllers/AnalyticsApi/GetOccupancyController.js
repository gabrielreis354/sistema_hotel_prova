import sequelize from '../../../database/connections/sequelize.js';
import { QueryTypes } from 'sequelize';

export default async function GetOccupancyController(request, response) {
    try {
        const tenantId = request.user.tenantId;
        const { date } = request.query;
        const refDate = date ?? new Date().toISOString().split('T')[0];

        const [counts] = await sequelize.query(`
            SELECT
                COUNT(*)                                         AS total_rooms,
                COUNT(*) FILTER (WHERE status = 'OCCUPIED')     AS occupied,
                COUNT(*) FILTER (WHERE status = 'AVAILABLE')    AS available,
                COUNT(*) FILTER (WHERE status = 'CLEANING')     AS cleaning
            FROM rooms
            WHERE tenant_id = :tenantId
              AND deleted_at IS NULL
        `, {
            replacements: { tenantId },
            type: QueryTypes.SELECT
        });

        const [adrRow] = await sequelize.query(`
            SELECT
                CASE
                    WHEN SUM(check_out_date - check_in_date) > 0
                    THEN (SUM(total_amount) / SUM(check_out_date - check_in_date))::float
                    ELSE 0
                END AS adr
            FROM reservations
            WHERE tenant_id = :tenantId
              AND status IN ('CHECKED_IN', 'CHECKED_OUT')
              AND check_in_date <= :refDate
              AND check_out_date >= :refDate
              AND deleted_at IS NULL
        `, {
            replacements: { tenantId, refDate },
            type: QueryTypes.SELECT
        });

        const total = parseInt(counts.total_rooms, 10);
        const occupied = parseInt(counts.occupied, 10);
        const available = parseInt(counts.available, 10);
        const cleaning = parseInt(counts.cleaning, 10);
        const adr = adrRow.adr ?? 0;
        const occupancy_rate = total > 0 ? parseFloat(((occupied / total) * 100).toFixed(2)) : 0;
        const revpar = parseFloat((adr * (occupancy_rate / 100)).toFixed(2));

        return response.json({
            date: refDate,
            total_rooms: total,
            occupied,
            available,
            cleaning,
            occupancy_rate,
            adr: parseFloat(adr.toFixed(2)),
            revpar
        });
    } catch (error) {
        console.error('GetOccupancyController:', error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
