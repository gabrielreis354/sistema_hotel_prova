import sequelize from '../../../database/connections/sequelize.js';
import ContractModel from '../../Models/ContractModel.js';
import ContractInstallmentModel from '../../Models/ContractInstallmentModel.js';
import CorporateClientModel from '../../Models/CorporateClientModel.js';
import generateContractPdf from '../../utils/generateContractPdf.js';
import uploadToMinIO from '../../utils/uploadToMinIO.js';

export default async function UpdateContractController(request, response) {
    try {
        const tenantId = request.user.tenantId;
        const contract = await ContractModel.findOne({ where: { id: request.params.id, tenant_id: tenantId } });
        if (!contract) return response.status(404).json({ error: 'Contrato não encontrado' });

        const { objeto, check_in, check_out, pessoas, total, testemunha_1, testemunha_2, status, installments, regenerate_pdf } = request.body;
        const fields = { objeto, check_in, check_out, pessoas, total, testemunha_1, testemunha_2, status };
        Object.entries(fields).forEach(([k, v]) => { if (v !== undefined) contract[k] = v; });

        const t = await sequelize.transaction();
        try {
            await contract.save({ transaction: t });

            if (installments !== undefined) {
                await ContractInstallmentModel.destroy({ where: { contract_id: contract.id }, transaction: t });
                if (installments.length > 0) {
                    const rows = installments.map(i => ({ tenant_id: tenantId, contract_id: contract.id, descricao: i.descricao, data_vencimento: i.data_vencimento, valor: i.valor }));
                    await ContractInstallmentModel.bulkCreate(rows, { transaction: t });
                }
            }

            if (regenerate_pdf) {
                const client = await CorporateClientModel.findOne({ where: { id: contract.corporate_client_id } });
                const allInstallments = await ContractInstallmentModel.findAll({ where: { contract_id: contract.id }, transaction: t });
                const pdfData = { ...contract.toJSON(), client: client.toJSON(), installments: allInstallments.map(i => i.toJSON()) };
                const pdfBuffer = await generateContractPdf(pdfData);
                const key = `${tenantId}/contracts/${contract.id}.pdf`;
                const pdfUrl = await uploadToMinIO(pdfBuffer, key);
                await contract.update({ pdf_url: pdfUrl }, { transaction: t });
            }

            await t.commit();
        } catch (err) {
            await t.rollback();
            throw err;
        }

        const result = await ContractModel.findOne({ where: { id: contract.id }, include: [{ model: ContractInstallmentModel, as: 'installments' }] });
        return response.json(result);
    } catch (error) {
        console.error('UpdateContractController:', error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
