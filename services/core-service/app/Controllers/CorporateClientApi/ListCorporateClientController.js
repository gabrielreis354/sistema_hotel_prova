import CorporateClientModel from '../../Models/CorporateClientModel.js';

export default async function ListCorporateClientController(request, response) {
    try {
        const tenantId = request.user.tenantId;
        const clients = await CorporateClientModel.findAll({ where: { tenant_id: tenantId } });
        return response.json(clients);
    } catch (error) {
        console.error('ListCorporateClientController:', error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
