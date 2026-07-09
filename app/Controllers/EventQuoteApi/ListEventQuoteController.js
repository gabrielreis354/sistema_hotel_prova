import EventQuoteModel from '../../Models/EventQuoteModel.js';
import CorporateClientModel from '../../Models/CorporateClientModel.js';

export default async function ListEventQuoteController(request, response) {
    try {
        const tenantId = request.user.tenantId;
        const quotes = await EventQuoteModel.findAll({
            where: { tenant_id: tenantId },
            include: [{ model: CorporateClientModel, as: 'client', attributes: ['id', 'razao_social', 'cnpj', 'email'] }],
            order: [['created_at', 'DESC']]
        });
        return response.json(quotes);
    } catch (error) {
        console.error('ListEventQuoteController:', error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
