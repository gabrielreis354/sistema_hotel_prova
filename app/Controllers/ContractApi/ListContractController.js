import ContractModel from '../../Models/ContractModel.js';
import CorporateClientModel from '../../Models/CorporateClientModel.js';

export default async function ListContractController(request, response) {
    try {
        const tenantId = request.user.tenantId;
        const contracts = await ContractModel.findAll({
            where: { tenant_id: tenantId },
            include: [{ model: CorporateClientModel, as: 'client', attributes: ['id', 'razao_social', 'cnpj'] }],
            order: [['created_at', 'DESC']]
        });
        return response.json(contracts);
    } catch (error) {
        console.error('ListContractController:', error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
