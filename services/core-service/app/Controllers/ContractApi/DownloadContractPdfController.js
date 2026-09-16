import ContractModel from '../../Models/ContractModel.js';
import CorporateClientModel from '../../Models/CorporateClientModel.js';
import ContractInstallmentModel from '../../Models/ContractInstallmentModel.js';
import generateContractPdf from '../../utils/generateContractPdf.js';
import { getPresignedDownloadUrl } from '../../utils/uploadToMinIO.js';

export default async function DownloadContractPdfController(request, response) {
    try {
        const tenantId = request.user.tenantId;
        const contract = await ContractModel.findOne({
            where: { id: request.params.id, tenant_id: tenantId },
            include: [
                { model: CorporateClientModel, as: 'client' },
                { model: ContractInstallmentModel, as: 'installments' }
            ]
        });
        if (!contract) return response.status(404).json({ error: 'Contrato não encontrado' });

        // Se já tem PDF no MinIO, gera uma URL assinada (bucket é privado, link direto
        // retorna 403) e redireciona; se não, gera o PDF on-demand.
        if (contract.pdf_url) {
            const key = `${tenantId}/contracts/${contract.id}.pdf`;
            const signedUrl = await getPresignedDownloadUrl(key);
            return response.redirect(signedUrl);
        }

        const buffer = await generateContractPdf(contract.toJSON());
        response.setHeader('Content-Type', 'application/pdf');
        response.setHeader('Content-Disposition', `attachment; filename="contrato_${contract.id}.pdf"`);
        return response.send(buffer);
    } catch (error) {
        console.error('DownloadContractPdfController:', error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
