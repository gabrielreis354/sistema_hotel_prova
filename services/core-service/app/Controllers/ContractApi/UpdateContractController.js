import sequelize from '../../../database/connections/sequelize.js';
import ContractModel from '../../Models/ContractModel.js';
import ContractInstallmentModel from '../../Models/ContractInstallmentModel.js';
import CorporateClientModel from '../../Models/CorporateClientModel.js';
import EventQuoteModel from '../../Models/EventQuoteModel.js';
import generateContractPdf from '../../utils/generateContractPdf.js';
import uploadToMinIO from '../../utils/uploadToMinIO.js';
import { summarizeContractInstallments } from '../../utils/summarizeContractInstallments.js';

export default async function UpdateContractController(request, response) {
    try {
        const tenantId = request.user.tenantId;
        const contract = await ContractModel.findOne({ where: { id: request.params.id, tenant_id: tenantId } });
        if (!contract) return response.status(404).json({ error: 'Contrato não encontrado' });

        // status é transição de estado — só via /:id/sign e /:id/cancel (dedicados).
        const { objeto, check_in, check_out, pessoas, total, testemunha_1, testemunha_2, installments, regenerate_pdf } = request.body;

        if (total !== undefined && contract.quote_id) {
            const quote = await EventQuoteModel.findOne({ where: { id: contract.quote_id, tenant_id: tenantId } });
            if (quote && Math.abs(Number(quote.total) - Number(total)) > 0.01) {
                return response.status(409).json({ error: `Total do contrato (${total}) não confere com o total do orçamento vinculado (${quote.total})` });
            }
        }

        const fields = { objeto, check_in, check_out, pessoas, total, testemunha_1, testemunha_2 };
        Object.entries(fields).forEach(([k, v]) => { if (v !== undefined) contract[k] = v; });

        const t = await sequelize.transaction();
        try {
            await contract.save({ transaction: t });

            if (installments !== undefined) {
                const existing = await ContractInstallmentModel.findAll({ where: { contract_id: contract.id }, transaction: t });
                const existingById = new Map(existing.map(i => [i.id, i]));
                const incomingIds = new Set(installments.filter(i => i.id).map(i => i.id));

                // Parcelas que sumiram do payload: só podem ser removidas se ainda não foram pagas.
                for (const inst of existing) {
                    if (!incomingIds.has(inst.id)) {
                        if (inst.status === 'PAID') {
                            await t.rollback();
                            return response.status(409).json({ error: `Não é possível remover a parcela "${inst.descricao}" — já está paga` });
                        }
                        await inst.destroy({ transaction: t, force: true });
                    }
                }

                for (const i of installments) {
                    if (i.id && existingById.has(i.id)) {
                        // Atualiza só os dados descritivos — status/paid_at são geridos pelo endpoint /pay.
                        await existingById.get(i.id).update(
                            { descricao: i.descricao, data_vencimento: i.data_vencimento, valor: i.valor },
                            { transaction: t }
                        );
                    } else {
                        await ContractInstallmentModel.create(
                            { tenant_id: tenantId, contract_id: contract.id, descricao: i.descricao, data_vencimento: i.data_vencimento, valor: i.valor },
                            { transaction: t }
                        );
                    }
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
        return response.json({ ...result.toJSON(), ...summarizeContractInstallments(result.installments) });
    } catch (error) {
        console.error('UpdateContractController:', error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
