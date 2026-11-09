import select from '../../utils/select.js';
import { readPeriod } from '../../utils/queryParams.js';

/**
 * GET /analytics/revenue-by-category — receita, reservas e ticket médio por categoria do quarto
 * principal (ADMIN e RECEPTIONIST). O período filtra pelo check-in, como no core. Ticket médio em
 * NUMERIC arredondado para centavo (no core era float sem arredondar).
 *
 * LEFT JOIN em quarto e categoria (decisão 3, 🟢-5 do qa-redteam da H.3): reserva cujo quarto ou
 * categoria não chegou à projeção — ou que aponta para outro hotel — não some do total; vai para a
 * linha "Sem categoria" (`category_id` e `category` null). Agrupa pelo id, não pelo nome.
 */
export default async function GetRevenueByCategoryController(request, response) {
    try {
        const tenantId = request.tenantId;
        const { error, period } = readPeriod(request.query);
        if (error) return response.status(400).json({ error });

        const dateFilter = period ? 'AND r.check_in_date BETWEEN :start AND :end' : '';

        const rows = await select(`
            SELECT rc.id                                               AS category_id,
                   rc.name                                             AS category,
                   COUNT(r.id)::int                                    AS reservations,
                   SUM(r.total_amount)::numeric(14,2)                  AS revenue,
                   ROUND(SUM(r.total_amount) / COUNT(r.id), 2)::numeric(14,2) AS avg_ticket
              FROM proj_reservations r
              LEFT JOIN proj_rooms rm           ON rm.id = r.room_id      AND rm.tenant_id = :tenantId
              LEFT JOIN proj_room_categories rc ON rc.id = rm.category_id AND rc.tenant_id = :tenantId
             WHERE r.tenant_id = :tenantId
               AND r.status <> 'CANCELLED'
               AND r.deleted_at IS NULL
               ${dateFilter}
             GROUP BY rc.id, rc.name
             ORDER BY SUM(r.total_amount) DESC, rc.name NULLS LAST
        `, { tenantId, start: period?.start ?? null, end: period?.end ?? null });

        return response.json(rows);
    } catch (error) {
        console.error('GetRevenueByCategoryController:', error.message);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
