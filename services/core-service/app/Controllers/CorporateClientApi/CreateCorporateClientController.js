import CorporateClientModel from '../../Models/CorporateClientModel.js';
import { onlyDigits } from '../../utils/onlyDigits.js';
import uniqueConstraintConflict from '../../utils/uniqueConstraintConflict.js';

export default async function CreateCorporateClientController(request, response) {
    try {
        const tenantId = request.user.tenantId;
        const { razao_social, cnpj, cpf, email, telefone, endereco, representante_nome, representante_cpf, representante_rg } = request.body;

        if (!razao_social) return response.status(400).json({ error: 'razao_social é obrigatório' });

        // Normaliza documentos: o frontend envia formatado, o banco guarda só dígitos
        // (cnpj varchar(14), cpf varchar(11)).
        const cnpjDigits = onlyDigits(cnpj);
        const cpfDigits = onlyDigits(cpf);
        const repCpfDigits = onlyDigits(representante_cpf);

        if (cnpjDigits) {
            const existing = await CorporateClientModel.findOne({ where: { cnpj: cnpjDigits, tenant_id: tenantId } });
            if (existing) return response.status(409).json({ error: 'CNPJ já cadastrado para este tenant' });
        }

        const client = await CorporateClientModel.create({
            tenant_id: tenantId, razao_social,
            cnpj: cnpjDigits, cpf: cpfDigits, email, telefone, endereco,
            representante_nome, representante_cpf: repCpfDigits, representante_rg
        });

        return response.status(201).json(client);
    } catch (error) {
        // Race no check-then-act acima: o índice único barra a segunda gravação.
        // Sem isto o conflito do cliente viraria 500.
        const conflito = uniqueConstraintConflict(error, response);
        if (conflito) return conflito;
        console.error('CreateCorporateClientController:', error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
