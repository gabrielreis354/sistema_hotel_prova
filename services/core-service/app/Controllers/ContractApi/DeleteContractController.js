import ContractModel from '../../Models/ContractModel.js';

export default async function DeleteContractController(request, response) {
    try {
        const tenantId = request.user.tenantId;
        const contract = await ContractModel.findOne({ where: { id: request.params.id, tenant_id: tenantId } });
        if (!contract) return response.status(404).json({ error: 'Contrato não encontrado' });
        await contract.destroy();
        return response.status(204).send();
    } catch (error) {
        console.error('DeleteContractController:', error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
