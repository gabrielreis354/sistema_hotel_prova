import sequelize from '../../../database/connections/sequelize.js';
import ReservationModel from '../../Models/ReservationModel.js';
import ReservationRoomModel from '../../Models/ReservationRoomModel.js';
import { recalculateReservationTotal } from '../../utils/recalculateReservationTotal.js';
import { reservationChangeBlocked } from '../../utils/reservationChangeGuard.js';

export default async function RemoveRoomFromReservationController(request, response) {
    const { id, roomId } = request.params;
    const tenantId = request.user.tenantId;

    // `return await fail(...)`, e a transação aberta DENTRO do try: uma falha do banco (pool
    // esgotado, rollback que falha) cai no catch e vira 500 — sem isso, a rejeição escapava do
    // handler e o Node encerrava o processo inteiro (reauditoria de 10/10, N2).
    let transaction;
    const fail = async (status, body) => {
        await transaction.rollback();
        return response.status(status).json(body);
    };
    try {
        transaction = await sequelize.transaction();
        const reservation = await ReservationModel.findOne({ where: { id, tenant_id: tenantId }, lock: transaction.LOCK.UPDATE, transaction });
        if (!reservation) return await fail(404, { error: 'Reserva não encontrada' });

        const blocked = reservationChangeBlocked(reservation);
        if (blocked) return await fail(blocked.status, { error: blocked.message });

        const pivot = await ReservationRoomModel.findOne({ where: { reservation_id: id, room_id: roomId }, transaction });
        if (!pivot) return await fail(404, { error: 'Quarto não vinculado a esta reserva' });

        // Compara pelo valor que o BANCO devolveu, não pelo texto da URL: o PostgreSQL aceita o
        // UUID em maiúsculas ou sem hífens, e a comparação com o texto deixava apagar o principal
        // (total 0,00 e quarto revendível — achado do /security-review de 10/10). O principal
        // mora em reservations.room_id; troca-se pelo PUT.
        if (pivot.room_id === reservation.room_id) {
            return await fail(409, { error: 'O quarto principal não pode ser removido — troque-o pelo PUT /reservations/:id' });
        }

        await pivot.destroy({ transaction });
        const recalculated = await recalculateReservationTotal(reservation, tenantId, transaction);
        if (recalculated.error) return await fail(recalculated.error.status, { error: recalculated.error.message });

        await transaction.commit();
        return response.status(204).send();
    } catch (error) {
        if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
        console.error(error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
