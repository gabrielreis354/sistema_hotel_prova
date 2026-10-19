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
        const { id } = request.params;
        const tenantId = request.user.tenantId;
        const { guest_id, room_id, check_in_date, check_out_date } = request.body;

        const reservation = await ReservationModel.findOne({
            where: { id, tenant_id: tenantId },
            lock: transaction.LOCK.UPDATE,
            transaction
        });
        if (!reservation) return await fail(404, { error: 'Reserva não encontrada' });

        // O hóspede precisa ser deste hotel — antes, qualquer id era aceito, e o GET devolvia o
        // hóspede de outro hotel com CPF e contato (achado 🔴-2 do qa-redteam de 10/10).
        if (guest_id !== undefined && guest_id !== reservation.guest_id) {
            const guest = await GuestModel.findOne({ where: { id: guest_id, tenant_id: tenantId }, transaction });
            if (!guest) return await fail(404, { error: 'Hóspede não encontrado' });
        }

        // O quarto novo precisa ser deste hotel — antes, qualquer id era aceito. E a partir daqui
        // vale o id CANÔNICO do banco: o PostgreSQL aceita o UUID em maiúsculas, e comparar o
        // texto da requisição deixava passar a troca por um extra da própria reserva (N3).
        let newRoomId = reservation.room_id;
        if (room_id !== undefined) {
            const room = await RoomModel.findOne({ where: { id: room_id, tenant_id: tenantId }, transaction });
            if (!room) return await fail(404, { error: 'Quarto não encontrado' });
            newRoomId = room.id;
        }

        const roomChanged = newRoomId !== reservation.room_id;
        const checkInDate  = check_in_date  ?? reservation.check_in_date;
        const checkOutDate = check_out_date ?? reservation.check_out_date;
        const datesChanged = checkInDate !== reservation.check_in_date || checkOutDate !== reservation.check_out_date;

        if (roomChanged || datesChanged) {
            const blocked = reservationChangeBlocked(reservation);
            if (blocked) return await fail(blocked.status, { error: blocked.message });
            if (checkOutDate <= checkInDate) return await fail(400, { error: 'check_out_date deve ser posterior a check_in_date' });

            const current = await ReservationRoomModel.findAll({ where: { reservation_id: reservation.id }, attributes: ['room_id'], transaction });
            const roomIds = new Set(current.map((r) => r.room_id));

            if (roomChanged) {
                // Trocar o principal por um quarto que já é extra desta reserva tiraria o principal
                // antigo da reserva em silêncio (o hóspede perderia um quarto e o total cairia).
                if (roomIds.has(newRoomId)) {
                    return await fail(409, { error: 'O quarto já é um quarto extra desta reserva — remova-o antes de torná-lo principal' });
                }
                roomIds.delete(reservation.room_id);
                roomIds.add(newRoomId);
            }

            // TODOS os quartos da reserva no período novo — os extras também (P-1).
            const conflicting = await findConflictingRooms([...roomIds], checkInDate, checkOutDate, reservation.id, tenantId, { transaction });
            if (conflicting.length > 0) return await fail(409, { error: ROOM_OCCUPIED_MESSAGE, room_ids: conflicting });
        }

        if (guest_id !== undefined)       reservation.guest_id = guest_id;
        if (roomChanged)                  reservation.room_id = newRoomId;
        if (check_in_date !== undefined)  reservation.check_in_date = check_in_date;
        if (check_out_date !== undefined) reservation.check_out_date = check_out_date;

        // Reserva + pivô (trocado pelo trigger ao mudar o room_id) + total, juntos.
        await reservation.save({ transaction });
        if (roomChanged || datesChanged) {
            const recalculated = await recalculateReservationTotal(reservation, tenantId, transaction);
            if (recalculated.error) return await fail(recalculated.error.status, { error: recalculated.error.message });
        }
        await transaction.commit();
        return response.json(reservation);
    } catch (error) {
        if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
        if (isRoomOccupiedError(error)) return response.status(409).json({ error: ROOM_OCCUPIED_MESSAGE });
        console.error(error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
