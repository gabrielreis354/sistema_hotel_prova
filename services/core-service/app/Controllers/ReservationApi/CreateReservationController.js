import ReservationModel from '../../Models/ReservationModel.js';
import ReservationRoomModel from '../../Models/ReservationRoomModel.js';
import RoomModel from '../../Models/RoomModel.js';
import GuestModel from '../../Models/GuestModel.js';
import sequelize from '../../../database/connections/sequelize.js';
import { findConflictingRooms, isRoomOccupiedError, ROOM_OCCUPIED_MESSAGE } from '../../utils/checkReservationConflict.js';
import { calculateStayTotal } from '../../utils/calculateStayTotal.js';
import findInTenant from '../../utils/findInTenant.js';

export default async function CreateReservationController(request, response) {
    try {
        const tenantId = request.user.tenantId;
        const userId = request.user.userId;
        const { guest_id, room_id, check_in_date, check_out_date, extra_room_ids } = request.body;

        const errors = [];
        if (!guest_id)       errors.push('guest_id obrigatório');
        if (!room_id)        errors.push('room_id obrigatório');
        if (!check_in_date)  errors.push('check_in_date obrigatório');
        if (!check_out_date) errors.push('check_out_date obrigatório');
        if (extra_room_ids !== undefined && !Array.isArray(extra_room_ids)) errors.push('extra_room_ids deve ser uma lista');
        if (!errors.length && check_out_date <= check_in_date) errors.push('check_out_date deve ser posterior a check_in_date');
        if (errors.length) return response.status(400).json({ errors });

        // Valida a FK do hóspede antes de qualquer escrita: um guest_id inexistente
        // estouraria a foreign key dentro da transação e retornaria 500 genérico.
        const guest = await GuestModel.findOne({ where: { id: guest_id, tenant_id: tenantId } });
        if (!guest) return response.status(404).json({ error: 'Hóspede não encontrado' });

        // Transação desde a leitura dos quartos: reserva + quartos extras são atômicos, e os
        // quartos são lidos com FOR SHARE (🟡-1 do qa-redteam de 30/10). A FK não enxerga
        // deleted_at: um quarto excluído entre a leitura e o INSERT virava reserva sem onde
        // hospedar. Com a trava, a leitura espera a exclusão em curso e o quarto excluído some
        // (404); a exclusão que chegar depois espera esta reserva e responde 409 (R-6).
        const transaction = await sequelize.transaction();
        const fail = async (status, body) => {
            await transaction.rollback();
            return response.status(status).json(body);
        };
        try {
            // Daqui em diante vale o id CANÔNICO do banco (o PostgreSQL aceita UUID em
            // maiúsculas; o mesmo quarto em duas grafias não pode virar dois quartos).
            const lockOptions = { transaction, lock: transaction.LOCK.SHARE };
            const room = await findInTenant(RoomModel, room_id, tenantId, lockOptions);
            if (!room) return await fail(404, { error: 'Quarto não encontrado' });
            const extraRoomIds = [];
            for (const rid of extra_room_ids ?? []) {
                const extraRoom = await findInTenant(RoomModel, rid, tenantId, lockOptions);
                if (!extraRoom) return await fail(404, { error: `Quarto extra não encontrado: ${rid}` });
                if (extraRoom.id !== room.id && !extraRoomIds.includes(extraRoom.id)) extraRoomIds.push(extraRoom.id);
            }
            const allRoomIds = [room.id, ...extraRoomIds];

            // TODOS os quartos — o principal e os extras — contra TODOS os ocupados no período,
            // principais e extras de outras reservas (P-1).
            const conflicting = await findConflictingRooms(allRoomIds, check_in_date, check_out_date, null, tenantId, { transaction });
            if (conflicting.length > 0) return await fail(409, { error: ROOM_OCCUPIED_MESSAGE, room_ids: conflicting });

            // Total soma todos os quartos (P-4) — mesma função da alteração.
            const stay = await calculateStayTotal({ roomIds: allRoomIds, checkInDate: check_in_date, checkOutDate: check_out_date, tenantId, transaction });
            if (stay.error) return await fail(stay.error.status, { error: stay.error.message });

            // O quarto principal entra no pivô pelo próprio banco (trigger
            // reservations_sincroniza_quartos) — inseri-lo aqui duplicaria a linha. O EXCLUDE do
            // pivô recusa a corrida que passou pela checagem acima.
            const reservation = await ReservationModel.create({
                tenant_id: tenantId,
                guest_id,
                room_id: room.id,
                user_id: userId,
                check_in_date,
                check_out_date,
                status: 'PENDING',
                total_amount: stay.total
            }, { transaction });

            for (const rid of extraRoomIds) {
                await ReservationRoomModel.create({ reservation_id: reservation.id, room_id: rid }, { transaction });
            }

            await transaction.commit();
            return response.status(201).json(reservation);
        } catch (txError) {
            if (!transaction.finished) await transaction.rollback();
            throw txError;
        }
    } catch (error) {
        if (isRoomOccupiedError(error)) return response.status(409).json({ error: ROOM_OCCUPIED_MESSAGE });
        console.error(error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
