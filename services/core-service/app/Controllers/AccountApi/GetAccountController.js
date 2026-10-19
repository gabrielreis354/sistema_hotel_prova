import AccountModel from '../../Models/AccountModel.js';
import AccountItemModel from '../../Models/AccountItemModel.js';
import isUuid from '../../utils/isUuid.js';
import accountTotal from '../../utils/accountTotal.js';

/**
 * GET /accounts/:id
 * Conta com os itens lançados (itens excluídos ficam de fora — paranoid) e o total
 * cobrável, que ignora cortesia (CA-04.1.j).
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

        return response.json({ ...account.toJSON(), total: await accountTotal(account.id, tenantId) });
    } catch (error) {
        console.error('GetAccountController:', error.message);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
