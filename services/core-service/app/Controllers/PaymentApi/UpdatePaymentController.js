import PaymentModel from '../../Models/PaymentModel.js';

export default async function UpdatePaymentController(request, response) {
    try {
        const payment = await PaymentModel.findOne({
            where: { id: request.params.id, tenant_id: request.user.tenantId }
        });

        if (!payment) {
            return response.status(404).json({ error: 'Pagamento não encontrado.' });
        }

        const { amount, method, paid_at } = request.body;

        await payment.update({ amount, method, paid_at });

        return response.json(payment);
    } catch (error) {
        console.error('UpdatePaymentController error:', error);
        return response.status(500).json({ error: 'Erro ao atualizar pagamento.' });
    }
}
