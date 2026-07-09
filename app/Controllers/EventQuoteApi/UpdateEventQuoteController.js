import sequelize from '../../../database/connections/sequelize.js';
import EventQuoteModel from '../../Models/EventQuoteModel.js';
import QuoteServiceModel from '../../Models/QuoteServiceModel.js';

export default async function UpdateEventQuoteController(request, response) {
    try {
        const tenantId = request.user.tenantId;
        const quote = await EventQuoteModel.findOne({ where: { id: request.params.id, tenant_id: tenantId } });
        if (!quote) return response.status(404).json({ error: 'Orçamento não encontrado' });

        const { check_in, check_out, pessoas, valor_diaria_com_refeicao, valor_diaria_sem_refeicao, inclui_refeicao, inclui_roupa_cama, desconto_pct, observacoes, status, services } = request.body;

        const fields = { check_in, check_out, pessoas, valor_diaria_com_refeicao, valor_diaria_sem_refeicao, inclui_refeicao, inclui_roupa_cama, desconto_pct, observacoes, status };
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

        const result = await EventQuoteModel.findOne({ where: { id: quote.id }, include: [{ model: QuoteServiceModel, as: 'services' }] });
        return response.json(result);
    } catch (error) {
        console.error('UpdateEventQuoteController:', error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
