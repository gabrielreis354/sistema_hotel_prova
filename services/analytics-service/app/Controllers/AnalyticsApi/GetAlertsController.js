import select from '../../utils/select.js';

/**
 * GET /analytics/alerts — o que pede atenção hoje (ADMIN e RECEPTIONIST).
 *
 * - D-1 (catálogo §9.1): sem telefone. A projeção de hóspede só tem o nome (CA-01.4.l); o alerta
 *   traz `guest_id` para a tela abrir a ficha do hóspede no core, que tem o contato e a permissão.
 * - D-3 refinada: risco de no-show = reserva CONFIRMED de hoje SEM NENHUM pagamento PAID — a
 *   garantia não chegou. Estornado (VOIDED), PIX pendente e excluído não contam como garantia.
 * - "Em limpeza desde" vem do evento que levou o quarto a CLEANING (`proj_rooms.cleaning_since`),
 *   e não do `updated_at` do core, que mudava com qualquer edição do quarto.
 *
 * LEFT JOIN em hóspede e categoria: eventos de agregados diferentes chegam em qualquer ordem.
 */
export default async function GetAlertsController(request, response) {
    try {
        const tenantId = request.tenantId;

        const noShowRisk = await select(`
            SELECT r.id            AS reservation_id,
                   r.guest_id,
                   g.full_name     AS guest,
                   r.check_in_date,
                   r.total_amount  AS amount
              FROM proj_reservations r
              LEFT JOIN proj_guests g ON g.id = r.guest_id AND g.tenant_id = :tenantId
             WHERE r.tenant_id = :tenantId
               AND r.status = 'CONFIRMED'
               AND r.check_in_date = CURRENT_DATE
               AND r.deleted_at IS NULL
               AND NOT EXISTS (
                   SELECT 1 FROM proj_payments p
                    WHERE p.tenant_id = :tenantId AND p.reservation_id = r.id
                      AND p.status = 'PAID' AND p.deleted_at IS NULL)
             ORDER BY r.total_amount DESC, r.id
        `, { tenantId });

        const cleaningPending = await select(`
            SELECT rm.id             AS room_id,
                   rm.number         AS room_number,
                   rc.name           AS category,
                   rm.cleaning_since
              FROM proj_rooms rm
              LEFT JOIN proj_room_categories rc ON rc.id = rm.category_id AND rc.tenant_id = :tenantId
             WHERE rm.tenant_id = :tenantId
               AND rm.status = 'CLEANING'
               AND rm.deleted_at IS NULL
             ORDER BY rm.cleaning_since, rm.id
        `, { tenantId });

        // `created_at` é o do core, carregado no evento (catálogo §4.5).
        const pendingTooLong = await select(`
            SELECT r.id            AS reservation_id,
                   r.guest_id,
                   g.full_name     AS guest,
                   r.check_in_date,
                   r.total_amount  AS amount,
                   r.created_at,
                   ROUND(EXTRACT(EPOCH FROM (NOW() - r.created_at)) / 3600, 1)::float AS hours_pending
              FROM proj_reservations r
              LEFT JOIN proj_guests g ON g.id = r.guest_id AND g.tenant_id = :tenantId
             WHERE r.tenant_id = :tenantId
               AND r.status = 'PENDING'
               AND r.created_at < NOW() - INTERVAL '48 hours'
               AND r.deleted_at IS NULL
             ORDER BY r.created_at, r.id
        `, { tenantId });

        return response.json({
            no_show_risk: noShowRisk,
            cleaning_pending: cleaningPending,
            pending_too_long: pendingTooLong
        });
    } catch (error) {
        console.error('GetAlertsController:', error.message);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
