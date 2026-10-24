import ReservationModel from '../../Models/ReservationModel.js';
import GuestModel from '../../Models/GuestModel.js';
import PaymentModel from '../../Models/PaymentModel.js';
import { reservationConsumptionItems } from '../../utils/itemAsConsumption.js';
import pendingLegacyConsumption from '../../utils/pendingLegacyConsumption.js';

/**
 * GET /reservations/:id/bill
 * Fechamento de conta: (diária + consumos extras) − pagamentos confirmados = saldo.
 *
 * Desde a T-04.2 os consumos são os itens faturáveis das contas da reserva; o contrato
 * de resposta é o mesmo (tests/bill-consumptions.test.js é o guardião).
 *
 * Considera PAGO apenas o que tem status PAID (um sinal PIX PENDING ainda não quita; um
 * pagamento estornado, VOIDED, segue listado como histórico — T-06.13).
 * Reserva cancelada: diária 0, como nas contas (D-46).
 */
export default async function GetBillController(request, response) {
    try {
        const { id } = request.params;
        const tenantId = request.user.tenantId;

        const reservation = await ReservationModel.findOne({
            where: { id, tenant_id: tenantId },
            include: [
                { model: GuestModel,       as: 'guest',        attributes: ['id', 'full_name'] },
                // Sem attributes viriam pix_qr_code, provider e provider_charge_id — que a
                // conta não usa e o `payments.map()` lá embaixo não devolve. Carregar só o
                // necessário evita que um `payments` devolvido inteiro no futuro vaze o QR.
                { model: PaymentModel,     as: 'payments',     attributes: ['id', 'amount', 'method', 'kind', 'status', 'paid_at', 'void_reason', 'voided_at'] }
            ]
        });
        if (!reservation) return response.status(404).json({ error: 'Reserva não encontrada' });

        // Consumo antigo ainda não migrado: o total sairia menor. Recusar, nunca mentir (D-31).
        if (await pendingLegacyConsumption(reservation.id)) {
            return response.status(503).json({ error: 'Consumos desta reserva em migração — conta temporariamente indisponível' });
        }

        const round = (n) => Number(n.toFixed(2));

        // Reserva cancelada não cobra diária (D-35, D-46): a mesma regra das contas. Sem isso,
        // a conta mandava devolver o sinal e este bill mandava cobrar a estadia (🟡-2 do
        // qa-redteam da T-04.4). Multa de cancelamento não existe na SPEC.
        const roomTotal    = reservation.status === 'CANCELLED' ? 0 : Number(reservation.total_amount);
        const payments      = reservation.payments ?? [];
        const consumptions  = await reservationConsumptionItems(reservation.id, tenantId);

        const consumptionsTotal = round(consumptions.reduce((acc, c) => acc + Number(c.total), 0));
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
                id: c.id, description: c.description, amount: Number(c.total), consumed_at: c.consumed_at
            })),
            payments: payments.map((p) => ({
                id: p.id, amount: Number(p.amount), method: p.method,
                kind: p.kind, status: p.status, paid_at: p.paid_at,
                // Estornado aparece marcado, com o motivo (CA-06.13.g) — e não soma em total_paid.
                void_reason: p.void_reason, voided_at: p.voided_at
            }))
        });
    } catch (error) {
        console.error('GetBillController:', error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
