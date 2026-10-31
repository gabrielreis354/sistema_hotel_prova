import select from '../../utils/select.js';
import { isCalendarDate } from '../../utils/queryParams.js';

/**
 * GET /analytics/occupancy — quartos por status, taxa de ocupação, ADR e RevPAR do dia
 * (ADMIN e RECEPTIONIST).
 *
 * ADR e RevPAR são dinheiro: calculados em NUMERIC e arredondados para centavo no SQL, devolvidos
 * como string decimal. No core eram `::float` e o RevPAR saía de `adr × taxa já arredondada`;
 * aqui é `adr × ocupados / total`, arredondado uma vez só. A taxa de ocupação é percentual, não
 * dinheiro, e continua número.
 */
export default async function GetOccupancyController(request, response) {
    try {
        const tenantId = request.tenantId;
        const { date } = request.query;
        if (date !== undefined && !isCalendarDate(date)) {
            return response.status(400).json({ error: 'date deve ser uma data válida no formato YYYY-MM-DD' });
        }
        // Mesmo padrão do core: sem `date`, o dia em UTC (a tela da T-05.6 manda sempre explícito).
        const refDate = date ?? new Date().toISOString().slice(0, 10);

        const [row] = await select(`
            WITH quartos AS (
                SELECT COUNT(*)::int                                     AS total_rooms,
                       COUNT(*) FILTER (WHERE status = 'OCCUPIED')::int  AS occupied,
                       COUNT(*) FILTER (WHERE status = 'AVAILABLE')::int AS available,
                       COUNT(*) FILTER (WHERE status = 'CLEANING')::int  AS cleaning
                  FROM proj_rooms
                 WHERE tenant_id = :tenantId AND deleted_at IS NULL
            ), estadias AS (
                SELECT CASE WHEN SUM(check_out_date - check_in_date) > 0
                            THEN SUM(total_amount) / SUM(check_out_date - check_in_date)
                            ELSE 0
                       END AS adr
                  FROM proj_reservations
                 WHERE tenant_id = :tenantId
                   AND status IN ('CHECKED_IN', 'CHECKED_OUT')
                   AND check_in_date  <= CAST(:refDate AS date)
                   AND check_out_date >= CAST(:refDate AS date)
                   AND deleted_at IS NULL
            )
            SELECT q.total_rooms, q.occupied, q.available, q.cleaning,
                   CASE WHEN q.total_rooms > 0
                        THEN ROUND(100.0 * q.occupied / q.total_rooms, 2) ELSE 0 END::float AS occupancy_rate,
                   ROUND(e.adr, 2)::numeric(14,2)                                         AS adr,
                   CASE WHEN q.total_rooms > 0
                        THEN ROUND(e.adr * q.occupied / q.total_rooms, 2) ELSE 0 END::numeric(14,2) AS revpar
              FROM quartos q CROSS JOIN estadias e
        `, { tenantId, refDate });

        return response.json({ date: refDate, ...row });
    } catch (error) {
        console.error('GetOccupancyController:', error.message);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
