import sequelize from '../../../database/connections/sequelize.js';
import ReservationModel from '../../Models/ReservationModel.js';
import ReservationRoomModel from '../../Models/ReservationRoomModel.js';
import { recalculateReservationTotal } from '../../utils/recalculateReservationTotal.js';
import { reservationChangeBlocked } from '../../utils/reservationChangeGuard.js';

export default async function RemoveRoomFromReservationController(request, response) {
    const { id, roomId } = request.params;
    const tenantId = request.user.tenantId;

    const transaction = await sequelize.transaction();
    const fail = async (status, body) => {
        await transaction.rollback();
        return response.status(status).json(body);
    };
    try {
        const reservation = await ReservationModel.findOne({ where: { id, tenant_id: tenantId }, lock: transaction.LOCK.UPDATE, transaction });
        if (!reservation) return fail(404, { error: 'Reserva não encontrada' });

        const blocked = reservationChangeBlocked(reservation);
        if (blocked) return fail(blocked.status, { error: blocked.message });

        const pivot = await ReservationRoomModel.findOne({ where: { reservation_id: id, room_id: roomId }, transaction });
        if (!pivot) return fail(404, { error: 'Quarto não vinculado a esta reserva' });

        // Compara pelo valor que o BANCO devolveu, não pelo texto da URL: o PostgreSQL aceita o
        // UUID em maiúsculas ou sem hífens, e a comparação com o texto deixava apagar o principal
        // (total 0,00 e quarto revendível — achado do /security-review de 10/10). O principal
        // mora em reservations.room_id; troca-se pelo PUT.
        if (pivot.room_id === reservation.room_id) {
            return fail(409, { error: 'O quarto principal não pode ser removido — troque-o pelo PUT /reservations/:id' });
        }

        await pivot.destroy({ transaction });
        const recalculated = await recalculateReservationTotal(reservation, tenantId, transaction);
        if (recalculated.error) return fail(recalculated.error.status, { error: recalculated.error.message });

        await transaction.commit();
        return response.status(204).send();
    } catch (error) {
        if (!transaction.finished) await transaction.rollback();
        console.error(error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
