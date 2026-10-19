import AccountModel from '../../Models/AccountModel.js';
import AccountItemModel from '../../Models/AccountItemModel.js';
import isUuid from '../../utils/isUuid.js';

/**
 * GET /accounts/:id
 * Conta com os itens lançados (itens excluídos ficam de fora — paranoid).
 * Sem hóspede nem reserva na resposta, pelo mesmo motivo da listagem (LGPD).
 */
export default async function GetAccountController(request, response) {
    try {
        const { id } = request.params;
        const tenantId = request.user.tenantId;

        // :id não-UUID chega ao Postgres como cast inválido e viraria 500.
        if (!isUuid(id)) return response.status(404).json({ error: 'Conta não encontrada' });

        const account = await AccountModel.findOne({
            where: { id, tenant_id: tenantId },
            include: [{ model: AccountItemModel, as: 'items' }],
            order: [[{ model: AccountItemModel, as: 'items' }, 'created_at', 'ASC']]
        });
        if (!account) return response.status(404).json({ error: 'Conta não encontrada' });

        return response.json(account);
    } catch (error) {
        console.error('GetAccountController:', error.message);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
