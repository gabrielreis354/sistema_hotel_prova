import ContractModel from '../../Models/ContractModel.js';
import CorporateClientModel from '../../Models/CorporateClientModel.js';
import ContractInstallmentModel from '../../Models/ContractInstallmentModel.js';
import { summarizeContractInstallments } from '../../utils/summarizeContractInstallments.js';

export default async function ListContractController(request, response) {
    try {
        const tenantId = request.user.tenantId;
        const contracts = await ContractModel.findAll({
            where: { tenant_id: tenantId },
            include: [
                { model: CorporateClientModel, as: 'client', attributes: ['id', 'razao_social', 'cnpj'] },
                { model: ContractInstallmentModel, as: 'installments' }
            ],
            order: [['created_at', 'DESC']]
        });
        const result = contracts.map(c => ({ ...c.toJSON(), ...summarizeContractInstallments(c.installments) }));
        return response.json(result);
    } catch (error) {
        console.error('ListContractController:', error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
