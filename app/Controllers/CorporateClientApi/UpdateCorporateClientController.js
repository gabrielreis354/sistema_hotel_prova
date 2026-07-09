import CorporateClientModel from '../../Models/CorporateClientModel.js';

export default async function UpdateCorporateClientController(request, response) {
    try {
        const tenantId = request.user.tenantId;
        const client = await CorporateClientModel.findOne({ where: { id: request.params.id, tenant_id: tenantId } });
        if (!client) return response.status(404).json({ error: 'Cliente não encontrado' });

        const fields = ['razao_social','cnpj','cpf','email','telefone','endereco','representante_nome','representante_cpf','representante_rg'];
        fields.forEach(f => { if (request.body[f] !== undefined) client[f] = request.body[f]; });
        await client.save();

        return response.json(client);
    } catch (error) {
        console.error('UpdateCorporateClientController:', error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
