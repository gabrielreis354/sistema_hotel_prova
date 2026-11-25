import CorporateClientModel from '../../Models/CorporateClientModel.js';
import { logError } from '../../utils/logError.js';

export default async function DeleteCorporateClientController(request, response) {
    try {
        const tenantId = request.user.tenantId;
        const client = await CorporateClientModel.findOne({ where: { id: request.params.id, tenant_id: tenantId } });
        if (!client) return response.status(404).json({ error: 'Cliente não encontrado' });
        await client.destroy();
        return response.status(204).send();
    } catch (error) {
        logError('DeleteCorporateClientController', error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
