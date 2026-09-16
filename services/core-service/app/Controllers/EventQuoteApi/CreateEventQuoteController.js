import sequelize from '../../../database/connections/sequelize.js';
import EventQuoteModel from '../../Models/EventQuoteModel.js';
import QuoteServiceModel from '../../Models/QuoteServiceModel.js';
import CorporateClientModel from '../../Models/CorporateClientModel.js';

export default async function CreateEventQuoteController(request, response) {
    try {
        const tenantId = request.user.tenantId;
        const { corporate_client_id, check_in, check_out, pessoas, valor_diaria_com_refeicao, valor_diaria_sem_refeicao, inclui_refeicao, inclui_roupa_cama, desconto_pct, observacoes, services = [] } = request.body;

        if (!corporate_client_id || !check_in || !check_out || !pessoas) {
            return response.status(400).json({ error: 'corporate_client_id, check_in, check_out e pessoas são obrigatórios' });
        }

        const client = await CorporateClientModel.findOne({ where: { id: corporate_client_id, tenant_id: tenantId } });
        if (!client) return response.status(404).json({ error: 'Cliente corporativo não encontrado' });

        const diarias = Math.ceil((new Date(check_out) - new Date(check_in)) / (1000 * 60 * 60 * 24));
        if (diarias <= 0) return response.status(400).json({ error: 'check_out deve ser posterior a check_in' });

        const valorDiaria = inclui_refeicao ? Number(valor_diaria_com_refeicao || 0) : Number(valor_diaria_sem_refeicao || 0);
        const subtotalHospedagem = valorDiaria * Number(pessoas) * diarias;
        const subtotalServicos = services.reduce((acc, s) => acc + (Number(s.quantidade) * Number(s.valor_unitario) * Number(s.diarias || 1)), 0);
        const desconto = Number(desconto_pct || 0);
        const total = (subtotalHospedagem + subtotalServicos) * (1 - desconto / 100);

        const t = await sequelize.transaction();
        try {
            const quote = await EventQuoteModel.create({
                tenant_id: tenantId, corporate_client_id, check_in, check_out, pessoas,
                valor_diaria_com_refeicao, valor_diaria_sem_refeicao,
                inclui_refeicao: !!inclui_refeicao, inclui_roupa_cama: !!inclui_roupa_cama,
                desconto_pct: desconto, total, observacoes
            }, { transaction: t });

            if (services.length > 0) {
                const serviceRows = services.map(s => ({
                    tenant_id: tenantId,
                    quote_id: quote.id,
                    nome: s.nome,
                    quantidade: s.quantidade,
                    valor_unitario: s.valor_unitario,
                    diarias: s.diarias || 1,
                    total: Number(s.quantidade) * Number(s.valor_unitario) * Number(s.diarias || 1)
                }));
                await QuoteServiceModel.bulkCreate(serviceRows, { transaction: t });
            }

            await t.commit();
            const result = await EventQuoteModel.findOne({ where: { id: quote.id }, include: [{ model: QuoteServiceModel, as: 'services' }] });
            return response.status(201).json(result);
        } catch (err) {
            await t.rollback();
            throw err;
        }
    } catch (error) {
        console.error('CreateEventQuoteController:', error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
