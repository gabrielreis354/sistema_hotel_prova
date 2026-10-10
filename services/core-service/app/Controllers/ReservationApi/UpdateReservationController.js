import sequelize from '../../../database/connections/sequelize.js';
import ReservationModel from '../../Models/ReservationModel.js';
import ReservationRoomModel from '../../Models/ReservationRoomModel.js';
import RoomModel from '../../Models/RoomModel.js';
import { findConflictingRooms, isRoomOccupiedError, ROOM_OCCUPIED_MESSAGE } from '../../utils/checkReservationConflict.js';
import { recalculateReservationTotal } from '../../utils/recalculateReservationTotal.js';

// Campos permitidos para atualização via PUT.
// Mudanças de status são exclusividade dos endpoints dedicados:
// PUT /:id/check-in | PUT /:id/check-out | PUT /:id/cancel
// total_amount é calculado pelo sistema e não pode ser sobrescrito pelo cliente — ao mudar
// datas ou quarto, é recalculado pela mesma regra da criação (CA-F.4.c).
export default async function UpdateReservationController(request, response) {
    try {
        const { id } = request.params;
        const tenantId = request.user.tenantId;
        const { guest_id, room_id, check_in_date, check_out_date } = request.body;

        const reservation = await ReservationModel.findOne({ where: { id, tenant_id: tenantId } });
        if (!reservation) return response.status(404).json({ error: 'Reserva não encontrada' });

        const datesOrRoomChanged = room_id !== undefined || check_in_date !== undefined || check_out_date !== undefined;
        if (datesOrRoomChanged) {
            if (room_id !== undefined) {
                // O quarto novo precisa ser deste hotel — antes, qualquer id era aceito.
                const room = await RoomModel.findOne({ where: { id: room_id, tenant_id: tenantId } });
                if (!room) return response.status(404).json({ error: 'Quarto não encontrado' });
            }

            const checkInDate  = check_in_date  ?? reservation.check_in_date;
            const checkOutDate = check_out_date ?? reservation.check_out_date;

            // TODOS os quartos da reserva no período novo — os extras também (P-1). Antes só o
            // principal era conferido, e mudar a data passava por cima do extra de outra reserva.
            const current = await ReservationRoomModel.findAll({ where: { reservation_id: reservation.id }, attributes: ['room_id'] });
            const roomIds = new Set(current.map((r) => r.room_id));
            if (room_id !== undefined) {
                roomIds.delete(reservation.room_id);
                roomIds.add(room_id);
            }

            const conflicting = await findConflictingRooms([...roomIds], checkInDate, checkOutDate, reservation.id, tenantId);
            if (conflicting.length > 0) {
                return response.status(409).json({ error: ROOM_OCCUPIED_MESSAGE, room_ids: conflicting });
            }
        }

        if (guest_id !== undefined)       reservation.guest_id = guest_id;
        if (room_id !== undefined)        reservation.room_id = room_id;
        if (check_in_date !== undefined)  reservation.check_in_date = check_in_date;
        if (check_out_date !== undefined) reservation.check_out_date = check_out_date;

        // Reserva + pivô (trocado pelo trigger ao mudar o room_id) + total, juntos.
        const transaction = await sequelize.transaction();
        try {
            await reservation.save({ transaction });
            if (datesOrRoomChanged) {
                const recalculated = await recalculateReservationTotal(reservation, tenantId, transaction);
                if (recalculated.error) {
                    await transaction.rollback();
                    return response.status(recalculated.error.status).json({ error: recalculated.error.message });
                }
            }
            await transaction.commit();
        } catch (txError) {
            await transaction.rollback();
            throw txError;
        }

        return response.json(reservation);
    } catch (error) {
        if (isRoomOccupiedError(error)) return response.status(409).json({ error: ROOM_OCCUPIED_MESSAGE });
        console.error(error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
