import PaymentModel from '../../Models/PaymentModel.js';
import ReservationModel from '../../Models/ReservationModel.js';

export default async function CreatePaymentController(request, response) {
    try {
        const { reservation_id, amount, method, paid_at } = request.body;

        if (!reservation_id || !amount || !method) {
            return response.status(400).json({ error: 'Campos obrigatórios: reservation_id, amount, method.' });
        }

        // Valida que a reserva pertence ao tenant
        const reservation = await ReservationModel.findOne({
            where: { id: reservation_id, tenant_id: request.user.tenantId }
        });

        if (!reservation) {
            return response.status(404).json({ error: 'Reserva não encontrada.' });
        }

        const payment = await PaymentModel.create({
            tenant_id: request.user.tenantId,
            reservation_id,
            amount,
            method,
            paid_at: paid_at ?? new Date()
        });

        return response.status(201).json(payment);
    } catch (error) {
        console.error('CreatePaymentController error:', error);
        return response.status(500).json({ error: 'Erro ao registrar pagamento.' });
    }
}
