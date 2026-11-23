import CorporateClientModel from '../../Models/CorporateClientModel.js';
import { logError } from '../../utils/logError.js';

export default async function ListCorporateClientController(request, response) {
    try {
        const tenantId = request.user.tenantId;
        const clients = await CorporateClientModel.findAll({ where: { tenant_id: tenantId } });
        return response.json(clients);
    } catch (error) {
        logError('ListCorporateClientController', error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
