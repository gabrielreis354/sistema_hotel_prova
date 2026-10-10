import sequelize from '../../../database/connections/sequelize.js';
import ReservationModel from '../../Models/ReservationModel.js';
import ReservationRoomModel from '../../Models/ReservationRoomModel.js';
import RoomModel from '../../Models/RoomModel.js';
import { checkReservationConflict, isRoomOccupiedError, ROOM_OCCUPIED_MESSAGE } from '../../utils/checkReservationConflict.js';
import { recalculateReservationTotal } from '../../utils/recalculateReservationTotal.js';

export default async function AddRoomToReservationController(request, response) {
    try {
        const { id } = request.params;
        const tenantId = request.user.tenantId;
        const { room_id } = request.body;

        if (!room_id) return response.status(400).json({ error: 'room_id obrigatório' });

        const reservation = await ReservationModel.findOne({ where: { id, tenant_id: tenantId } });
        if (!reservation) return response.status(404).json({ error: 'Reserva não encontrada' });

        const room = await RoomModel.findOne({ where: { id: room_id, tenant_id: tenantId } });
        if (!room) return response.status(404).json({ error: 'Quarto não encontrado' });

        const existing = await ReservationRoomModel.findOne({ where: { reservation_id: id, room_id } });
        if (existing) return response.status(409).json({ error: 'Quarto já vinculado a esta reserva' });

        // P-1: antes, o quarto entrava sem nenhuma checagem de disponibilidade.
        const occupied = await checkReservationConflict(room_id, reservation.check_in_date, reservation.check_out_date, reservation.id, tenantId);
        if (occupied) return response.status(409).json({ error: ROOM_OCCUPIED_MESSAGE, room_ids: [room_id] });

        const transaction = await sequelize.transaction();
        try {
            const pivot = await ReservationRoomModel.create({ reservation_id: id, room_id }, { transaction });
            const recalculated = await recalculateReservationTotal(reservation, tenantId, transaction);
            if (recalculated.error) {
                await transaction.rollback();
                return response.status(recalculated.error.status).json({ error: recalculated.error.message });
            }
            await transaction.commit();
            return response.status(201).json(pivot);
        } catch (txError) {
            await transaction.rollback();
            throw txError;
        }
    } catch (error) {
        if (isRoomOccupiedError(error)) return response.status(409).json({ error: ROOM_OCCUPIED_MESSAGE });
        console.error(error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
