import PaymentModel from '../../Models/PaymentModel.js';
import ReservationModel from '../../Models/ReservationModel.js';

export default async function ListPaymentController(request, response) {
    try {
        const payments = await PaymentModel.findAll({
            where: { tenant_id: request.user.tenantId },
            include: [
                { model: ReservationModel, as: 'reservation', attributes: ['id', 'check_in_date', 'check_out_date', 'status'] }
            ],
            order: [['created_at', 'DESC']]
        });

        return response.json(payments);
    } catch (error) {
        console.error('ListPaymentController error:', error);
        return response.status(500).json({ error: 'Erro ao listar pagamentos.' });
    }
}
