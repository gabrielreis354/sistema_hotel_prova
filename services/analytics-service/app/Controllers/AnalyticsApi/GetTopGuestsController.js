import select from '../../utils/select.js';
import { readIntInRange } from '../../utils/queryParams.js';

/**
 * GET /analytics/top-guests — ranking de hóspedes por valor acumulado. SÓ ADMIN (RT-51): é dado
 * pessoal (nome com quanto gastou) — o router aplica `requireRole('ADMIN')`, como no core.
 *
 * Sem e-mail (D-1, commits e991361/d2d51c8 do core): a projeção de hóspede nem guarda e-mail
 * (CA-01.4.l). Hóspede eliminado (T-06.11) aparece como "Hóspede eliminado", com o histórico.
 */
export default async function GetTopGuestsController(request, response) {
    try {
        const tenantId = request.tenantId;
        const { error, value: limit } = readIntInRange(request.query.limit, { name: 'limit', min: 1, max: 100, fallback: 10 });
        if (error) return response.status(400).json({ error });

        const rows = await select(`
            SELECT g.id                                  AS guest_id,
                   g.full_name,
                   COUNT(r.id)::int                      AS total_reservations,
                   SUM(r.total_amount)::numeric(14,2)    AS lifetime_value,
                   MAX(r.check_out_date)                 AS last_stay
              FROM proj_guests g
              JOIN proj_reservations r ON r.guest_id = g.id AND r.tenant_id = :tenantId
             WHERE g.tenant_id = :tenantId
               AND g.deleted_at IS NULL
               AND r.status <> 'CANCELLED'
               AND r.deleted_at IS NULL
             GROUP BY g.id, g.full_name
             ORDER BY SUM(r.total_amount) DESC, g.id
             LIMIT :limit
        `, { tenantId, limit });

        return response.json(rows);
    } catch (error) {
        console.error('GetTopGuestsController:', error.message);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
