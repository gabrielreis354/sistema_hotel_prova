import sequelize from '../../../database/connections/sequelize.js';
import ContractModel from '../../Models/ContractModel.js';
import ContractInstallmentModel from '../../Models/ContractInstallmentModel.js';
import CorporateClientModel from '../../Models/CorporateClientModel.js';
import EventQuoteModel from '../../Models/EventQuoteModel.js';
import generateContractPdf from '../../utils/generateContractPdf.js';
import uploadToMinIO from '../../utils/uploadToMinIO.js';

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
        }

        const t = await sequelize.transaction();
        try {
            const contract = await ContractModel.create({
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

            // Gerar PDF e fazer upload no MinIO
            const allInstallments = await ContractInstallmentModel.findAll({ where: { contract_id: contract.id }, transaction: t });
            const pdfData = { ...contract.toJSON(), client: client.toJSON(), installments: allInstallments.map(i => i.toJSON()) };
            const pdfBuffer = await generateContractPdf(pdfData);
            const key = `${tenantId}/contracts/${contract.id}.pdf`;
            const pdfUrl = await uploadToMinIO(pdfBuffer, key);

            await contract.update({ pdf_url: pdfUrl }, { transaction: t });
            await t.commit();

            return response.status(201).json({ ...contract.toJSON(), pdf_url: pdfUrl });
        } catch (err) {
            await t.rollback();
            throw err;
        }
    } catch (error) {
        console.error('CreateContractController:', error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
