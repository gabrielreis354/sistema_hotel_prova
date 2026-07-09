import EventQuoteModel from '../../Models/EventQuoteModel.js';
import QuoteServiceModel from '../../Models/QuoteServiceModel.js';
import CorporateClientModel from '../../Models/CorporateClientModel.js';

export default async function GetEventQuoteController(request, response) {
    try {
        const tenantId = request.user.tenantId;
        const quote = await EventQuoteModel.findOne({
            where: { id: request.params.id, tenant_id: tenantId },
            include: [
                { model: CorporateClientModel, as: 'client' },
                { model: QuoteServiceModel, as: 'services' }
            ]
        });
        if (!quote) return response.status(404).json({ error: 'Orçamento não encontrado' });
        return response.json(quote);
    } catch (error) {
        console.error('GetEventQuoteController:', error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
