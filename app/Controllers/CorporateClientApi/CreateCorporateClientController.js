import CorporateClientModel from '../../Models/CorporateClientModel.js';

export default async function CreateCorporateClientController(request, response) {
    try {
        const tenantId = request.user.tenantId;
        const { razao_social, cnpj, cpf, email, telefone, endereco, representante_nome, representante_cpf, representante_rg } = request.body;

        if (!razao_social) return response.status(400).json({ error: 'razao_social é obrigatório' });

        if (cnpj) {
            const existing = await CorporateClientModel.findOne({ where: { cnpj, tenant_id: tenantId } });
            if (existing) return response.status(409).json({ error: 'CNPJ já cadastrado para este tenant' });
        }

        const client = await CorporateClientModel.create({
            tenant_id: tenantId, razao_social, cnpj, cpf, email, telefone, endereco,
            representante_nome, representante_cpf, representante_rg
        });

        return response.status(201).json(client);
    } catch (error) {
        console.error('CreateCorporateClientController:', error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
