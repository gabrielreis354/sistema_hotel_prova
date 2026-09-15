import ReservationModel from '../../Models/ReservationModel.js';
import GuestModel from '../../Models/GuestModel.js';
import PaymentModel from '../../Models/PaymentModel.js';
import ConsumptionModel from '../../Models/ConsumptionModel.js';

/**
 * GET /reservations/:id/bill
 * Fechamento de conta: (diária + consumos extras) − pagamentos confirmados = saldo.
 *
 * Considera PAGO apenas o que tem status PAID (um sinal PIX PENDING ainda não quita).
 */
export default async function GetBillController(request, response) {
    try {
        const { id } = request.params;
        const tenantId = request.user.tenantId;

        const reservation = await ReservationModel.findOne({
            where: { id, tenant_id: tenantId },
            include: [
                { model: GuestModel,       as: 'guest',        attributes: ['id', 'full_name'] },
                { model: PaymentModel,     as: 'payments' },
                { model: ConsumptionModel, as: 'consumptions' }
            ]
        });
        if (!reservation) return response.status(404).json({ error: 'Reserva não encontrada' });

        const round = (n) => Number(n.toFixed(2));

        const roomTotal    = Number(reservation.total_amount);
        const payments      = reservation.payments ?? [];
        const consumptions  = reservation.consumptions ?? [];

        const consumptionsTotal = round(consumptions.reduce((acc, c) => acc + Number(c.amount), 0));
        const grandTotal        = round(roomTotal + consumptionsTotal);

        const sumPaymentsBy = (status) => round(payments
            .filter((p) => p.status === status)
            .reduce((acc, p) => acc + Number(p.amount), 0));

        const totalPaid    = sumPaymentsBy('PAID');
        const totalPending = sumPaymentsBy('PENDING');
        const balanceDue   = round(grandTotal - totalPaid);

        return response.status(200).json({
            reservation_id: reservation.id,
            status: reservation.status,
            guest: reservation.guest?.full_name ?? null,
            check_in_date: reservation.check_in_date,
            check_out_date: reservation.check_out_date,
            room_total: roomTotal,
            consumptions_total: consumptionsTotal,
            grand_total: grandTotal,
            total_paid: totalPaid,
            total_pending: totalPending,
            balance_due: balanceDue,
            fully_paid: balanceDue <= 0,
            consumptions: consumptions.map((c) => ({
                id: c.id, description: c.description, amount: Number(c.amount), consumed_at: c.consumed_at
            })),
            payments: payments.map((p) => ({
                id: p.id, amount: Number(p.amount), method: p.method,
                kind: p.kind, status: p.status, paid_at: p.paid_at
            }))
        });
    } catch (error) {
        console.error('GetBillController:', error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
