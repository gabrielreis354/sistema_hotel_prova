import ContractModel from '../../Models/ContractModel.js';
import CorporateClientModel from '../../Models/CorporateClientModel.js';
import ContractInstallmentModel from '../../Models/ContractInstallmentModel.js';

export default async function GetContractController(request, response) {
    try {
        const tenantId = request.user.tenantId;
        const contract = await ContractModel.findOne({
            where: { id: request.params.id, tenant_id: tenantId },
            include: [
                { model: CorporateClientModel, as: 'client' },
                { model: ContractInstallmentModel, as: 'installments' }
            ]
        });
        if (!contract) return response.status(404).json({ error: 'Contrato não encontrado' });
        return response.json(contract);
    } catch (error) {
        console.error('GetContractController:', error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
