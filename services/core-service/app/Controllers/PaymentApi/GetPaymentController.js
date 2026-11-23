import PaymentModel from '../../Models/PaymentModel.js';
import ReservationModel from '../../Models/ReservationModel.js';
import { logError } from '../../utils/logError.js';

export default async function GetPaymentController(request, response) {
    try {
        const payment = await PaymentModel.findOne({
            where: { id: request.params.id, tenant_id: request.user.tenantId },
            include: [
                { model: ReservationModel, as: 'reservation', attributes: ['id', 'check_in_date', 'check_out_date', 'status', 'total_amount'] }
            ]
        });

        if (!payment) {
            return response.status(404).json({ error: 'Pagamento não encontrado.' });
        }

        return response.json(payment);
    } catch (error) {
        logError('GetPaymentController', error);
        return response.status(500).json({ error: 'Erro ao buscar pagamento.' });
    }
}
