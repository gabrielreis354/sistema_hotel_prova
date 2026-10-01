import sequelize from '../../../database/connections/sequelize.js';
import EventQuoteModel from '../../Models/EventQuoteModel.js';
import QuoteServiceModel from '../../Models/QuoteServiceModel.js';
import CorporateClientModel from '../../Models/CorporateClientModel.js';
import generateQuotePdf from '../../utils/generateQuotePdf.js';
import storeDocumentPdf, { documentPdfKey } from '../../utils/storeDocumentPdf.js';

// Allowlist explícita: só orçamento enviado e ainda não respondido pode ser editado — fail-safe.
// Confirmado ou cancelado, o orçamento é registro do que o cliente aceitou ou recusou; editá-lo
// sobrescreveria o PDF persistido (RNF-023).
const EDITABLE_STATUSES = ['SENT'];

const EDIT_BLOCKED_MESSAGES = {
    CONFIRMED: 'Orçamento confirmado não pode ser editado — ele é o registro do que o cliente aceitou',
    CANCELLED: 'Orçamento cancelado não pode ser editado',
};

export default async function UpdateEventQuoteController(request, response) {
    try {
        const tenantId = request.user.tenantId;
        const quote = await EventQuoteModel.findOne({ where: { id: request.params.id, tenant_id: tenantId } });
        if (!quote) return response.status(404).json({ error: 'Orçamento não encontrado' });

        if (!EDITABLE_STATUSES.includes(quote.status)) {
            const message = EDIT_BLOCKED_MESSAGES[quote.status]
                ?? `Edição não permitida no status '${quote.status}'`;
            return response.status(409).json({ error: message });
        }

        // status é transição de estado — só via /:id/confirm e /:id/cancel (dedicados).
        const { check_in, check_out, pessoas, valor_diaria_com_refeicao, valor_diaria_sem_refeicao, inclui_refeicao, inclui_roupa_cama, desconto_pct, observacoes, services } = request.body;

        const fields = { check_in, check_out, pessoas, valor_diaria_com_refeicao, valor_diaria_sem_refeicao, inclui_refeicao, inclui_roupa_cama, desconto_pct, observacoes };
        Object.entries(fields).forEach(([k, v]) => { if (v !== undefined) quote[k] = v; });

        // Recalcular total se campos de preço foram alterados
        const ci = new Date(quote.check_in);
        const co = new Date(quote.check_out);
        const diarias = Math.ceil((co - ci) / (1000 * 60 * 60 * 24));
        const valorDiaria = quote.inclui_refeicao ? Number(quote.valor_diaria_com_refeicao || 0) : Number(quote.valor_diaria_sem_refeicao || 0);
        const existingServices = await QuoteServiceModel.findAll({ where: { quote_id: quote.id } });
        const subtotalServicos = existingServices.reduce((acc, s) => acc + Number(s.total), 0);
        const desconto = Number(quote.desconto_pct || 0);
        quote.total = (valorDiaria * Number(quote.pessoas) * diarias + subtotalServicos) * (1 - desconto / 100);

        const t = await sequelize.transaction();
        try {
            await quote.save({ transaction: t });
            if (services !== undefined) {
                await QuoteServiceModel.destroy({ where: { quote_id: quote.id }, transaction: t });
                if (services.length > 0) {
                    const rows = services.map(s => ({
                        tenant_id: tenantId, quote_id: quote.id,
                        nome: s.nome, quantidade: s.quantidade, valor_unitario: s.valor_unitario,
                        diarias: s.diarias || 1,
                        total: Number(s.quantidade) * Number(s.valor_unitario) * Number(s.diarias || 1)
                    }));
                    await QuoteServiceModel.bulkCreate(rows, { transaction: t });
                }
            }
            await t.commit();
        } catch (err) {
            await t.rollback();
            throw err;
        }

        // Regera na mesma chave (CA-D.4): o PDF persistido acompanha a versão enviada ao cliente.
        const result = await EventQuoteModel.findOne({
            where: { id: quote.id, tenant_id: tenantId },
            include: [{ model: QuoteServiceModel, as: 'services' }]
        });
        const client = await CorporateClientModel.findOne({ where: { id: result.corporate_client_id, tenant_id: tenantId } });
        await storeDocumentPdf(
            result,
            documentPdfKey(tenantId, 'quotes', result.id),
            () => generateQuotePdf({ ...result.toJSON(), client: client.toJSON() }),
            'UpdateEventQuoteController'
        );
        return response.json(result);
    } catch (error) {
        console.error('UpdateEventQuoteController:', error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
