import EventQuoteModel from '../../Models/EventQuoteModel.js';
import QuoteServiceModel from '../../Models/QuoteServiceModel.js';
import CorporateClientModel from '../../Models/CorporateClientModel.js';
import generateQuotePdf from '../../utils/generateQuotePdf.js';

export default async function DownloadQuotePdfController(request, response) {
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

        const buffer = await generateQuotePdf(quote.toJSON());
        const filename = `orcamento_${quote.client.razao_social.replace(/\s+/g, '_')}_${quote.check_in}.pdf`;

        response.setHeader('Content-Type', 'application/pdf');
        response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return response.send(buffer);
    } catch (error) {
        console.error('DownloadQuotePdfController:', error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
