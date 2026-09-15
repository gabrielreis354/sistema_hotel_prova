import sequelize from '../../../database/connections/sequelize.js';
import ContractModel from '../../Models/ContractModel.js';
import ContractInstallmentModel from '../../Models/ContractInstallmentModel.js';
import CorporateClientModel from '../../Models/CorporateClientModel.js';
import EventQuoteModel from '../../Models/EventQuoteModel.js';
import generateContractPdf from '../../utils/generateContractPdf.js';
import uploadToMinIO from '../../utils/uploadToMinIO.js';
import { summarizeContractInstallments } from '../../utils/summarizeContractInstallments.js';

export default async function CreateContractController(request, response) {
    try {
        const tenantId = request.user.tenantId;
        const { corporate_client_id, quote_id, objeto, check_in, check_out, pessoas, total, testemunha_1, testemunha_2, installments = [] } = request.body;

        if (!corporate_client_id || !objeto || !check_in || !check_out || !pessoas || !total || !testemunha_1 || !testemunha_2) {
            return response.status(400).json({ error: 'corporate_client_id, objeto, check_in, check_out, pessoas, total, testemunha_1 e testemunha_2 são obrigatórios' });
        }

        const client = await CorporateClientModel.findOne({ where: { id: corporate_client_id, tenant_id: tenantId } });
        if (!client) return response.status(404).json({ error: 'Cliente corporativo não encontrado' });
        if (!client.representante_nome) return response.status(400).json({ error: 'Cliente não possui representante legal cadastrado. Atualize o cliente antes de gerar o contrato.' });

        if (quote_id) {
            const quote = await EventQuoteModel.findOne({ where: { id: quote_id, tenant_id: tenantId } });
            if (!quote) return response.status(404).json({ error: 'Orçamento não encontrado' });
            if (Math.abs(Number(quote.total) - Number(total)) > 0.01) {
                return response.status(409).json({ error: `Total do contrato (${total}) não confere com o total do orçamento vinculado (${quote.total})` });
            }
        }

        // Transação cobre apenas o dado core (contrato + parcelas). O PDF é artefato
        // derivado e NÃO deve fazer parte da atomicidade — senão uma indisponibilidade
        // do MinIO impediria a criação do contrato (e travaria a operação do hotel).
        const t = await sequelize.transaction();
        let contract;
        try {
            contract = await ContractModel.create({
                tenant_id: tenantId, corporate_client_id, quote_id: quote_id || null,
                objeto, check_in, check_out, pessoas, total, testemunha_1, testemunha_2
            }, { transaction: t });

            if (installments.length > 0) {
                const instRows = installments.map(i => ({
                    tenant_id: tenantId,
                    contract_id: contract.id,
                    descricao: i.descricao,
                    data_vencimento: i.data_vencimento,
                    valor: i.valor
                }));
                await ContractInstallmentModel.bulkCreate(instRows, { transaction: t });
            }

            await t.commit();
        } catch (err) {
            await t.rollback();
            throw err;
        }

        // Geração do PDF em best-effort (fora da transação). Se o MinIO falhar, o contrato
        // permanece criado com pdf_url null — o PDF pode ser gerado depois via GET /:id/pdf.
        let pdfUrl = null;
        const allInstallments = await ContractInstallmentModel.findAll({ where: { contract_id: contract.id } });
        try {
            const pdfData = { ...contract.toJSON(), client: client.toJSON(), installments: allInstallments.map(i => i.toJSON()) };
            const pdfBuffer = await generateContractPdf(pdfData);
            const key = `${tenantId}/contracts/${contract.id}.pdf`;
            pdfUrl = await uploadToMinIO(pdfBuffer, key);
            await contract.update({ pdf_url: pdfUrl });
        } catch (pdfError) {
            console.warn('CreateContractController: contrato criado, mas PDF/MinIO falhou:', pdfError.message);
        }

        return response.status(201).json({
            ...contract.toJSON(),
            pdf_url: pdfUrl,
            installments: allInstallments.map(i => i.toJSON()),
            ...summarizeContractInstallments(allInstallments)
        });
    } catch (error) {
        console.error('CreateContractController:', error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
