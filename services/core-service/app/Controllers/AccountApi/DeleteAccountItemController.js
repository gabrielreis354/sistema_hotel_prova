import sequelize from '../../../database/connections/sequelize.js';
import AccountModel from '../../Models/AccountModel.js';
import AccountItemModel from '../../Models/AccountItemModel.js';
import isUuid from '../../utils/isUuid.js';

/**
 * DELETE /accounts/:id/items/:itemId
 * Exclui (soft delete) um lançamento. Só ADMIN, pela rota (D-8): apagar o que foi
 * cobrado é ato financeiro. Grava quem excluiu (D-7).
 */
export default async function DeleteAccountItemController(request, response) {
    try {
        const tenantId = request.user.tenantId;
        const { id: accountId, itemId } = request.params;

        if (!isUuid(accountId)) return response.status(404).json({ error: 'Conta não encontrada' });
        if (!isUuid(itemId)) return response.status(404).json({ error: 'Item não encontrado' });

        const transaction = await sequelize.transaction();
        try {
            // Trava a conta pelo mesmo motivo do lançamento: não excluir durante o fechamento.
            const account = await AccountModel.findOne({
                where: { id: accountId, tenant_id: tenantId },
                lock: transaction.LOCK.UPDATE,
                transaction
            });
            if (!account) {
                await transaction.rollback();
                return response.status(404).json({ error: 'Conta não encontrada' });
            }

            const item = await AccountItemModel.findOne({
                where: { id: itemId, account_id: accountId, tenant_id: tenantId },
                transaction
            });
            if (!item) {
                await transaction.rollback();
                return response.status(404).json({ error: 'Item não encontrado' });
            }

            // Conta fechada ou paga já foi apresentada ao hóspede: não muda mais.
            if (account.status !== 'OPEN') {
                await transaction.rollback();
                return response.status(422).json({ error: `Conta ${account.status} não permite excluir item` });
            }

            // Um UPDATE só: o destroy de model paranoid faz save() dos campos alterados,
            // então deleted_by e deleted_at saem juntos — nunca um sem o outro (D-7).
            item.deleted_by = request.user.userId;
            await item.destroy({ transaction });

            await transaction.commit();
            return response.status(204).send();
        } catch (error) {
            await transaction.rollback();
            throw error;
        }
    } catch (error) {
        console.error('DeleteAccountItemController:', error.message);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
