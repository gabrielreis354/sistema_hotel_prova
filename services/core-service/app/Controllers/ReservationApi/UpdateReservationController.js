import sequelize from '../../../database/connections/sequelize.js';
import ReservationModel from '../../Models/ReservationModel.js';
import ReservationRoomModel from '../../Models/ReservationRoomModel.js';
import RoomModel from '../../Models/RoomModel.js';
import GuestModel from '../../Models/GuestModel.js';
import { findConflictingRooms, isRoomOccupiedError, ROOM_OCCUPIED_MESSAGE } from '../../utils/checkReservationConflict.js';
import { recalculateReservationTotal } from '../../utils/recalculateReservationTotal.js';
import { reservationChangeBlocked } from '../../utils/reservationChangeGuard.js';

// Campos permitidos para atualização via PUT.
// Mudanças de status são exclusividade dos endpoints dedicados:
// PUT /:id/check-in | PUT /:id/check-out | PUT /:id/cancel
// total_amount é calculado pelo sistema e não pode ser sobrescrito pelo cliente — quando o
// quarto ou as datas MUDAM, é recalculado pela mesma regra da criação (CA-F.4.c).
export default async function UpdateReservationController(request, response) {
    // A reserva é lida com lock DENTRO da transação: duas alterações simultâneas da mesma reserva
    // (datas, quartos) se serializam, e o total nunca é calculado sobre uma foto parcial.
    const transaction = await sequelize.transaction();
    const fail = async (status, body) => {
        await transaction.rollback();
        return response.status(status).json(body);
    };
    try {
        const { id } = request.params;
        const tenantId = request.user.tenantId;
        const { guest_id, room_id, check_in_date, check_out_date } = request.body;

        const reservation = await ReservationModel.findOne({
            where: { id, tenant_id: tenantId },
            lock: transaction.LOCK.UPDATE,
            transaction
        });
        if (!reservation) return fail(404, { error: 'Reserva não encontrada' });

        // O hóspede precisa ser deste hotel — antes, qualquer id era aceito, e o GET devolvia o
        // hóspede de outro hotel com CPF e contato (achado 🔴-2 do qa-redteam de 10/10).
        if (guest_id !== undefined && guest_id !== reservation.guest_id) {
            const guest = await GuestModel.findOne({ where: { id: guest_id, tenant_id: tenantId }, transaction });
            if (!guest) return fail(404, { error: 'Hóspede não encontrado' });
        }

        const roomChanged = room_id !== undefined && room_id !== reservation.room_id;
        const checkInDate  = check_in_date  ?? reservation.check_in_date;
        const checkOutDate = check_out_date ?? reservation.check_out_date;
        const datesChanged = checkInDate !== reservation.check_in_date || checkOutDate !== reservation.check_out_date;

        if (roomChanged || datesChanged) {
            const blocked = reservationChangeBlocked(reservation);
            if (blocked) return fail(blocked.status, { error: blocked.message });
            if (checkOutDate <= checkInDate) return fail(400, { error: 'check_out_date deve ser posterior a check_in_date' });

            const current = await ReservationRoomModel.findAll({ where: { reservation_id: reservation.id }, attributes: ['room_id'], transaction });
            const roomIds = new Set(current.map((r) => r.room_id));

            if (roomChanged) {
                // O quarto novo precisa ser deste hotel — antes, qualquer id era aceito.
                const room = await RoomModel.findOne({ where: { id: room_id, tenant_id: tenantId }, transaction });
                if (!room) return fail(404, { error: 'Quarto não encontrado' });
                // Trocar o principal por um quarto que já é extra desta reserva tiraria o principal
                // antigo da reserva em silêncio (o hóspede perderia um quarto e o total cairia).
                if (roomIds.has(room_id)) {
                    return fail(409, { error: 'O quarto já é um quarto extra desta reserva — remova-o antes de torná-lo principal' });
                }
                roomIds.delete(reservation.room_id);
                roomIds.add(room_id);
            }

            // TODOS os quartos da reserva no período novo — os extras também (P-1).
            const conflicting = await findConflictingRooms([...roomIds], checkInDate, checkOutDate, reservation.id, tenantId, { transaction });
            if (conflicting.length > 0) return fail(409, { error: ROOM_OCCUPIED_MESSAGE, room_ids: conflicting });
        }

        if (guest_id !== undefined)       reservation.guest_id = guest_id;
        if (room_id !== undefined)        reservation.room_id = room_id;
        if (check_in_date !== undefined)  reservation.check_in_date = check_in_date;
        if (check_out_date !== undefined) reservation.check_out_date = check_out_date;

        // Reserva + pivô (trocado pelo trigger ao mudar o room_id) + total, juntos.
        await reservation.save({ transaction });
        if (roomChanged || datesChanged) {
            const recalculated = await recalculateReservationTotal(reservation, tenantId, transaction);
            if (recalculated.error) return fail(recalculated.error.status, { error: recalculated.error.message });
        }
        await transaction.commit();
        return response.json(reservation);
    } catch (error) {
        if (!transaction.finished) await transaction.rollback();
        if (isRoomOccupiedError(error)) return response.status(409).json({ error: ROOM_OCCUPIED_MESSAGE });
        console.error(error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
