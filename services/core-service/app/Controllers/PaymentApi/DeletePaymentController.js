import PaymentModel from '../../Models/PaymentModel.js';

export default async function DeletePaymentController(request, response) {
    try {
        const payment = await PaymentModel.findOne({
            where: { id: request.params.id, tenant_id: request.user.tenantId }
        });

        if (!payment) {
            return response.status(404).json({ error: 'Pagamento não encontrado.' });
        }

        await payment.destroy();

        return response.status(204).send();
    } catch (error) {
        console.error('DeletePaymentController error:', error);
        return response.status(500).json({ error: 'Erro ao remover pagamento.' });
    }
}
