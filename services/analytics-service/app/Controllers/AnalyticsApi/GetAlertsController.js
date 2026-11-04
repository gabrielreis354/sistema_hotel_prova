import select from '../../utils/select.js';
import { hotelToday } from '../../utils/hotelTimezone.js';
import { readListLimit, TOTAL_COLUMN, splitTotal } from '../../utils/limitedList.js';

/**
 * GET /analytics/alerts — o que pede atenção hoje (ADMIN e RECEPTIONIST).
 *
 * - D-1 (catálogo §9.1): sem telefone. A projeção de hóspede só tem o nome (CA-01.4.l); o alerta
 *   traz `guest_id` para a tela abrir a ficha do hóspede no core, que tem o contato e a permissão.
 * - D-3 refinada: risco de no-show = reserva CONFIRMED de hoje SEM NENHUM pagamento PAID — a
 *   garantia não chegou. Estornado (VOIDED), PIX pendente e excluído não contam como garantia.
 * - "Hoje" é o dia do hotel (D-68): depois das 21h em Brasília, CURRENT_DATE (UTC) já olhava o
 *   check-in de amanhã (🟢-3 do qa-redteam da H.3, repasse D-8 da T-05.3).
 * - "Em limpeza desde" vem do evento que levou o quarto a CLEANING (`proj_rooms.cleaning_since`),
 *   e não do `updated_at` do core, que mudava com qualquer edição do quarto.
 *
 * Cada lista tem teto (`limit`, padrão 50, máximo 100) e `totals` diz quantas há em cada uma (🟢-4 do
 * qa-redteam da H.3: sem teto, 2,2 MB com 50 mil reservas).
 *
 * LEFT JOIN em hóspede e categoria: eventos de agregados diferentes chegam em qualquer ordem.
 */
export default async function GetAlertsController(request, response) {
    try {
        const tenantId = request.tenantId;
        const { error, value: limit } = readListLimit(request.query);
        if (error) return response.status(400).json({ error });

        const noShowRisk = await select(`
            SELECT r.id            AS reservation_id,
                   r.guest_id,
                   g.full_name     AS guest,
                   r.check_in_date,
                   r.total_amount  AS amount,
                   ${TOTAL_COLUMN}
              FROM proj_reservations r
              LEFT JOIN proj_guests g ON g.id = r.guest_id AND g.tenant_id = :tenantId
             WHERE r.tenant_id = :tenantId
               AND r.status = 'CONFIRMED'
               AND r.check_in_date = CAST(:today AS date)
               AND r.deleted_at IS NULL
               AND NOT EXISTS (
                   SELECT 1 FROM proj_payments p
                    WHERE p.tenant_id = :tenantId AND p.reservation_id = r.id
                      AND p.status = 'PAID' AND p.deleted_at IS NULL)
             ORDER BY r.total_amount DESC, r.id
             LIMIT :limit
        `, { tenantId, limit, today: hotelToday() });

        const cleaningPending = await select(`
            SELECT rm.id             AS room_id,
                   rm.number         AS room_number,
                   rc.name           AS category,
                   rm.cleaning_since,
                   ${TOTAL_COLUMN}
              FROM proj_rooms rm
              LEFT JOIN proj_room_categories rc ON rc.id = rm.category_id AND rc.tenant_id = :tenantId
             WHERE rm.tenant_id = :tenantId
               AND rm.status = 'CLEANING'
               AND rm.deleted_at IS NULL
             ORDER BY rm.cleaning_since, rm.id
             LIMIT :limit
        `, { tenantId, limit });

        // `created_at` é o do core, carregado no evento (catálogo §4.5).
        const pendingTooLong = await select(`
            SELECT r.id            AS reservation_id,
                   r.guest_id,
                   g.full_name     AS guest,
                   r.check_in_date,
                   r.total_amount  AS amount,
                   r.created_at,
                   ROUND(EXTRACT(EPOCH FROM (NOW() - r.created_at)) / 3600, 1)::float AS hours_pending,
                   ${TOTAL_COLUMN}
              FROM proj_reservations r
              LEFT JOIN proj_guests g ON g.id = r.guest_id AND g.tenant_id = :tenantId
             WHERE r.tenant_id = :tenantId
               AND r.status = 'PENDING'
               AND r.created_at < NOW() - INTERVAL '48 hours'
               AND r.deleted_at IS NULL
             ORDER BY r.created_at, r.id
             LIMIT :limit
        `, { tenantId, limit });

        const noShow = splitTotal(noShowRisk);
        const cleaning = splitTotal(cleaningPending);
        const pending = splitTotal(pendingTooLong);
        return response.json({
            no_show_risk: noShow.rows,
            cleaning_pending: cleaning.rows,
            pending_too_long: pending.rows,
            totals: { no_show_risk: noShow.total, cleaning_pending: cleaning.total, pending_too_long: pending.total }
        });
    } catch (error) {
        console.error('GetAlertsController:', error.message);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
