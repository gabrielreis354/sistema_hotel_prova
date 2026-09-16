import ContractModel from '../../Models/ContractModel.js';
import ContractInstallmentModel from '../../Models/ContractInstallmentModel.js';

/**
 * PUT /contracts/:id/installments/:installmentId/pay
 * Marca uma parcela do contrato como paga. Transição de estado dedicada —
 * não é exposta via PUT genérico do contrato (evita perder a baixa em edições).
 */
export default async function PayContractInstallmentController(request, response) {
    try {
        const tenantId = request.user.tenantId;
        const { id: contractId, installmentId } = request.params;
        const { paid_at } = request.body;

        const contract = await ContractModel.findOne({ where: { id: contractId, tenant_id: tenantId } });
        if (!contract) return response.status(404).json({ error: 'Contrato não encontrado' });

        const installment = await ContractInstallmentModel.findOne({
            where: { id: installmentId, contract_id: contractId, tenant_id: tenantId }
        });
        if (!installment) return response.status(404).json({ error: 'Parcela não encontrada' });

        if (installment.status === 'PAID') {
            return response.status(409).json({ error: 'Parcela já está paga' });
        }

        installment.status = 'PAID';
        installment.paid_at = paid_at ? new Date(paid_at) : new Date();
        await installment.save();

        return response.status(200).json(installment);
    } catch (error) {
        console.error('PayContractInstallmentController:', error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
