import EventQuoteModel from '../../Models/EventQuoteModel.js';
import QuoteServiceModel from '../../Models/QuoteServiceModel.js';
import CorporateClientModel from '../../Models/CorporateClientModel.js';
import generateQuotePdf from '../../utils/generateQuotePdf.js';
import { getPresignedDownloadUrl } from '../../utils/uploadToMinIO.js';
import { documentPdfKey } from '../../utils/storeDocumentPdf.js';

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

        // RNF-023: com o PDF persistido, entrega o documento que foi enviado ao cliente, por URL
        // assinada de 5 minutos (bucket privado). Sem ele (MinIO falhou na geração), gera sob
        // demanda — mesmo comportamento do contrato.
        if (quote.pdf_url) {
            const signedUrl = await getPresignedDownloadUrl(documentPdfKey(tenantId, 'quotes', quote.id));
            return response.redirect(signedUrl);
        }

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
