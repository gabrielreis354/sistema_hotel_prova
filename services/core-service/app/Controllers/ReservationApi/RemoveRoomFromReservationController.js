import sequelize from '../../../database/connections/sequelize.js';
import ReservationModel from '../../Models/ReservationModel.js';
import ReservationRoomModel from '../../Models/ReservationRoomModel.js';
import { recalculateReservationTotal } from '../../utils/recalculateReservationTotal.js';

export default async function RemoveRoomFromReservationController(request, response) {
    try {
        const { id, roomId } = request.params;
        const tenantId = request.user.tenantId;

        const reservation = await ReservationModel.findOne({ where: { id, tenant_id: tenantId } });
        if (!reservation) return response.status(404).json({ error: 'Reserva não encontrada' });

        // O quarto principal mora em reservations.room_id e o banco o mantém no pivô: tirá-lo
        // daqui deixaria a reserva ocupando um quarto que a disponibilidade não enxerga.
        if (roomId === reservation.room_id) {
            return response.status(409).json({ error: 'O quarto principal não pode ser removido — troque-o pelo PUT /reservations/:id' });
        }

        const pivot = await ReservationRoomModel.findOne({ where: { reservation_id: id, room_id: roomId } });
        if (!pivot) return response.status(404).json({ error: 'Quarto não vinculado a esta reserva' });

        const transaction = await sequelize.transaction();
        try {
            await pivot.destroy({ transaction });
            const recalculated = await recalculateReservationTotal(reservation, tenantId, transaction);
            if (recalculated.error) {
                await transaction.rollback();
                return response.status(recalculated.error.status).json({ error: recalculated.error.message });
            }
            await transaction.commit();
        } catch (txError) {
            await transaction.rollback();
            throw txError;
        }
        return response.status(204).send();
    } catch (error) {
        console.error(error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
