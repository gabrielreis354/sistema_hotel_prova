import sequelize from '../../../database/connections/sequelize.js';
import ReservationModel from '../../Models/ReservationModel.js';
import ReservationRoomModel from '../../Models/ReservationRoomModel.js';
import RoomModel from '../../Models/RoomModel.js';
import { checkReservationConflict, isRoomOccupiedError, ROOM_OCCUPIED_MESSAGE } from '../../utils/checkReservationConflict.js';
import { recalculateReservationTotal } from '../../utils/recalculateReservationTotal.js';
import { reservationChangeBlocked } from '../../utils/reservationChangeGuard.js';

export default async function AddRoomToReservationController(request, response) {
    const { id } = request.params;
    const tenantId = request.user.tenantId;
    const { room_id } = request.body;
    if (!room_id) return response.status(400).json({ error: 'room_id obrigatório' });

    // Reserva lida com lock dentro da transação: dois quartos adicionados ao mesmo tempo à mesma
    // reserva se serializam — sem isso, cada um calculava o total sem o quarto do outro.
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

        const room = await RoomModel.findOne({ where: { id: room_id, tenant_id: tenantId }, transaction });
        if (!room) return fail(404, { error: 'Quarto não encontrado' });

        const existing = await ReservationRoomModel.findOne({ where: { reservation_id: id, room_id: room.id }, transaction });
        if (existing) return fail(409, { error: 'Quarto já vinculado a esta reserva' });

        // P-1: antes, o quarto entrava sem nenhuma checagem de disponibilidade.
        const occupied = await checkReservationConflict(room.id, reservation.check_in_date, reservation.check_out_date, reservation.id, tenantId, { transaction });
        if (occupied) return fail(409, { error: ROOM_OCCUPIED_MESSAGE, room_ids: [room.id] });

        const pivot = await ReservationRoomModel.create({ reservation_id: id, room_id: room.id }, { transaction });
        const recalculated = await recalculateReservationTotal(reservation, tenantId, transaction);
        if (recalculated.error) return fail(recalculated.error.status, { error: recalculated.error.message });

        await transaction.commit();
        return response.status(201).json(pivot);
    } catch (error) {
        if (!transaction.finished) await transaction.rollback();
        if (isRoomOccupiedError(error)) return response.status(409).json({ error: ROOM_OCCUPIED_MESSAGE });
        console.error(error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
