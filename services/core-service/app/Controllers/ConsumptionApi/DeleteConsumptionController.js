import sequelize from '../../../database/connections/sequelize.js';
import AccountModel from '../../Models/AccountModel.js';
import AccountItemModel from '../../Models/AccountItemModel.js';
import isUuid from '../../utils/isUuid.js';
import ReservationModel from '../../Models/ReservationModel.js';
import pendingLegacyConsumption from '../../utils/pendingLegacyConsumption.js';

/**
 * DELETE /reservations/:id/consumptions/:consumptionId
 * Remove (soft delete) um consumo extra da reserva. Restrito a ADMIN (rota) —
 * grava quem autorizou a exclusão para trilha de auditoria financeira.
 *
 * Desde a T-04.2 o consumo é item de uma conta da reserva; o id é o mesmo do consumo
 * antigo para os itens migrados (CA-04.2.d).
 */
export default async function DeleteConsumptionController(request, response) {
    try {
        const tenantId = request.user.tenantId;
        const { id: reservationId, consumptionId } = request.params;

        // id não-UUID chegava ao Postgres como cast inválido e virava 500.
        if (!isUuid(reservationId) || !isUuid(consumptionId)) {
            return response.status(404).json({ error: 'Consumo não encontrado' });
        }

        // Mesmo escopo da listagem: item faturável de uma conta desta reserva.
        const findItem = (transaction) => AccountItemModel.findOne({
            where: { id: consumptionId, tenant_id: tenantId, billable: true },
            include: [{
                model: AccountModel,
                as: 'account',
                where: { reservation_id: reservationId, tenant_id: tenantId },
                attributes: ['id']
            }],
            transaction
        });

        // Primeira leitura só para saber qual conta travar.
        const found = await findItem();
        if (!found) {
            // Consumo antigo ainda não migrado: 503, como o bill e a lista (reauditoria N-6).
            // A reserva é conferida no hotel ANTES: senão o 503 diria a outro hotel que
            // aquela reserva existe e tem consumo pendente.
            const reservation = await ReservationModel.findOne({ where: { id: reservationId, tenant_id: tenantId } });
            if (reservation && await pendingLegacyConsumption(reservationId)) {
                return response.status(503).json({ error: 'Consumos desta reserva em migração — tente de novo depois' });
            }
            return response.status(404).json({ error: 'Consumo não encontrado' });
        }

        const transaction = await sequelize.transaction();
        try {
            // Trava a conta ANTES de reler o item, como no DELETE de /accounts. Lendo antes
            // de travar, DELETEs simultâneos viam o item vivo e todos respondiam 204,
            // regravando deleted_by (qa-redteam 19/10, 🟢-1).
            const account = await AccountModel.findOne({
                where: { id: found.account_id, tenant_id: tenantId },
                lock: transaction.LOCK.UPDATE,
                transaction
            });

            const item = await findItem(transaction);
            if (!item) {
                await transaction.rollback();
                return response.status(404).json({ error: 'Consumo não encontrado' });
            }

            if (account.status !== 'OPEN') {
                await transaction.rollback();
                return response.status(422).json({ error: `Conta ${account.status} não permite excluir consumo` });
            }

            // destroy de model paranoid salva os campos alterados: deleted_by e deleted_at
            // saem no mesmo UPDATE (D-7).
            item.deleted_by = request.user.userId;
            await item.destroy({ transaction });

            await transaction.commit();
            return response.status(204).send();
        } catch (error) {
            await transaction.rollback();
            throw error;
        }
    } catch (error) {
        console.error('DeleteConsumptionController:', error.message);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
