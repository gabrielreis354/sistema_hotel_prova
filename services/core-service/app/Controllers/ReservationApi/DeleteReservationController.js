import sequelize from '../../../database/connections/sequelize.js';
import ReservationModel from '../../Models/ReservationModel.js';
import closeReservationAccounts from '../../utils/closeReservationAccounts.js';

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
        return response.status(204).send();
    } catch (error) {
        if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
        console.error(error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
