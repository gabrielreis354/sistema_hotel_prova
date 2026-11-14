import sequelize from '../../../database/connections/sequelize.js';
import ReservationModel from '../../Models/ReservationModel.js';
import closeReservationAccounts from '../../utils/closeReservationAccounts.js';
import cancelPendingCharges from '../../services/pix/cancelPendingCharges.js';

export default async function DeleteReservationController(request, response) {
    const { id } = request.params;
    const tenantId = request.user.tenantId;

    // Excluir a reserva e fechar as contas dela é uma operação só (SPEC-04, T-04.3, D-36):
    // duas tabelas, então transação — conta aberta de reserva excluída lotaria as comandas.
    let transaction;
    try {
        transaction = await sequelize.transaction();
        const reservation = await ReservationModel.findOne({ where: { id, tenant_id: tenantId }, lock: transaction.LOCK.UPDATE, transaction });
        if (!reservation) {
            await transaction.rollback();
            return response.status(404).json({ error: 'Reserva não encontrada' });
        }
        await reservation.destroy({ transaction });
        await closeReservationAccounts(reservation, transaction);
        await transaction.commit();
        // O sinal PIX pendente morre com a reserva (🟡 do qa-redteam de 11/11), como no
        // cancelamento: depois do commit e sem lançar, para o PSP fora do ar não travar a exclusão.
        await cancelPendingCharges(reservation);
        return response.status(204).send();
    } catch (error) {
        if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
        console.error(error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
