import select from '../../utils/select.js';
import { readPeriod } from '../../utils/queryParams.js';
import { HOTEL_TIMEZONE } from '../../utils/hotelTimezone.js';
import { readListLimit, TOTAL_COLUMN, splitTotal } from '../../utils/limitedList.js';

// Receita efetivada = só PAID; VOIDED (estorno, T-06.13) e excluído (D-2) não contam.
const PAID = `status = 'PAID' AND paid_at IS NOT NULL AND deleted_at IS NULL`;

/**
 * GET /analytics/revenue — caixa realizado × esperado × valores em aberto (ADMIN e RECEPTIONIST).
 *
 * `unpaid` segue a D-3 refinada do catálogo (§9.1): reserva ativa com SALDO > 0, isto é,
 * `total_amount` − soma dos pagamentos PAID. Uma reserva com sinal de 30% continua na lista,
 * devendo 70% — no core ela saía da lista com qualquer pagamento PAID.
 *
 * `unpaid` tem teto (`limit`, padrão 50, máximo 100) e `unpaid_total` diz quantas há (🟢-4 do
 * qa-redteam da H.3: sem teto, 1,9 MB com 50 mil reservas). Os totais não dependem do limite.
 */
export default async function GetRevenueController(request, response) {
    try {
        const tenantId = request.tenantId;
        const { error, period } = readPeriod(request.query);
        if (error) return response.status(400).json({ error });
        const { error: limitError, value: limit } = readListLimit(request.query);
        if (limitError) return response.status(400).json({ error: limitError });

        // Dia e mês do hotel (D-68): o pagamento das 22h em Brasília é de hoje, não de amanhã.
        const dateFilter = period ? 'AND (paid_at AT TIME ZONE :timezone)::date BETWEEN :start AND :end' : '';
        const replacements = { tenantId, timezone: HOTEL_TIMEZONE, start: period?.start ?? null, end: period?.end ?? null };

        const byMonth = await select(`
            SELECT TO_CHAR(DATE_TRUNC('month', paid_at AT TIME ZONE :timezone), 'YYYY-MM') AS month,
                   SUM(amount)::numeric(14,2)                       AS total
              FROM proj_payments
             WHERE tenant_id = :tenantId AND ${PAID} ${dateFilter}
             GROUP BY 1
             ORDER BY 1
        `, replacements);

        const [realized] = await select(`
            SELECT COALESCE(SUM(amount), 0)::numeric(14,2) AS total
              FROM proj_payments
             WHERE tenant_id = :tenantId AND ${PAID} ${dateFilter}
        `, replacements);

        const [expected] = await select(`
            SELECT COALESCE(SUM(total_amount), 0)::numeric(14,2) AS total
              FROM proj_reservations
             WHERE tenant_id = :tenantId
               AND status IN ('CONFIRMED', 'CHECKED_IN')
               AND deleted_at IS NULL
        `, { tenantId });

        // LEFT JOIN no hóspede: os eventos chegam em qualquer ordem, e a reserva não pode sumir da
        // lista só porque o guest.created ainda não foi consumido (guest fica null até lá).
        const unpaidRows = await select(`
            SELECT r.id                                            AS reservation_id,
                   r.guest_id,
                   g.full_name                                     AS guest,
                   r.total_amount                                  AS amount,
                   COALESCE(p.paid, 0)::numeric(14,2)              AS paid,
                   (r.total_amount - COALESCE(p.paid, 0))::numeric(14,2) AS balance,
                   r.check_in_date,
                   r.check_out_date,
                   ${TOTAL_COLUMN}
              FROM proj_reservations r
              LEFT JOIN proj_guests g
                     ON g.id = r.guest_id AND g.tenant_id = :tenantId
              LEFT JOIN (SELECT reservation_id, SUM(amount) AS paid
                           FROM proj_payments
                          WHERE tenant_id = :tenantId AND status = 'PAID' AND deleted_at IS NULL
                            AND reservation_id IS NOT NULL
                          GROUP BY reservation_id) p
                     ON p.reservation_id = r.id
             WHERE r.tenant_id = :tenantId
               AND r.status IN ('CONFIRMED', 'CHECKED_IN')
               AND r.deleted_at IS NULL
               AND r.total_amount - COALESCE(p.paid, 0) > 0
             ORDER BY r.check_in_date, r.id
             LIMIT :limit
        `, { tenantId, limit });
        const { rows: unpaid, total: unpaidTotal } = splitTotal(unpaidRows);

        return response.json({
            realized: { total: realized.total, by_month: byMonth },
            expected: { total: expected.total },
            unpaid,
            unpaid_total: unpaidTotal
        });
    } catch (error) {
        console.error('GetRevenueController:', error.message);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
