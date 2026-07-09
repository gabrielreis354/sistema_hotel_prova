import EventQuoteModel from '../../Models/EventQuoteModel.js';

export default async function DeleteEventQuoteController(request, response) {
    try {
        const tenantId = request.user.tenantId;
        const quote = await EventQuoteModel.findOne({ where: { id: request.params.id, tenant_id: tenantId } });
        if (!quote) return response.status(404).json({ error: 'Orçamento não encontrado' });
        await quote.destroy();
        return response.status(204).send();
    } catch (error) {
        console.error('DeleteEventQuoteController:', error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
