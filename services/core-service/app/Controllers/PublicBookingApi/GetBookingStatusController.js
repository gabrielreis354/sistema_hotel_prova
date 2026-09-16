import { resolveTenantBySubdomain } from '../../utils/resolveTenantBySubdomain.js';
import ReservationModel from '../../Models/ReservationModel.js';
import PaymentModel from '../../Models/PaymentModel.js';

/**
 * GET /public/:subdomain/bookings/:id/status
 *
 * Polling do status da reserva pela página pública. O hóspede acompanha aqui
 * a mudança de PENDING → CONFIRMED após pagar o PIX.
 * Escopado ao tenant do subdomínio (isolamento multi-tenant).
 */
export default async function GetBookingStatusController(request, response) {
    try {
        const { subdomain, id } = request.params;

        const { tenant, error } = await resolveTenantBySubdomain(subdomain);
        if (error) return response.status(error.status).json({ error: error.message });

        const reservation = await ReservationModel.findOne({
            where: { id, tenant_id: tenant.id },
            // Endpoint PÚBLICO, sem autenticação: carregar o Payment inteiro traria
            // pix_qr_code, provider e provider_charge_id para a memória do handler —
            // um `return reservation.payments` futuro viraria vazamento. attributes
            // explícito limita ao que o hóspede precisa para acompanhar a reserva.
            //
            // Mantenha o include em UMA linha: a regra 6 do scripts/qa_checks.sh (grep de
            // linha única) é só um AVISO (report_warn) — não bloqueia o CI sozinha. Quem
            // garante esta restrição de verdade é o teste "a query do status público
            // restringe os atributos do Payment carregado" em tests/public-booking.test.js,
            // que espiona a query e falha se o `attributes` sumir daqui.
            include: [{ model: PaymentModel, as: 'payments', attributes: ['kind', 'status', 'amount', 'paid_at'] }]
        });
        if (!reservation) {
            return response.status(404).json({ error: 'Reserva não encontrada' });
        }

        const deposit = (reservation.payments || []).find((p) => p.kind === 'DEPOSIT');

        return response.status(200).json({
            reservation_id: reservation.id,
            status: reservation.status,
            check_in: reservation.check_in_date,
            check_out: reservation.check_out_date,
            total_amount: Number(reservation.total_amount),
            deposit: deposit
                ? { status: deposit.status, amount: Number(deposit.amount), paid_at: deposit.paid_at }
                : null,
            confirmed: reservation.status === 'CONFIRMED'
        });
    } catch (error) {
        console.error('GetBookingStatusController:', error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
