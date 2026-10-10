import ReservationModel from '../../Models/ReservationModel.js';
import ReservationRoomModel from '../../Models/ReservationRoomModel.js';
import RoomModel from '../../Models/RoomModel.js';
import GuestModel from '../../Models/GuestModel.js';
import sequelize from '../../../database/connections/sequelize.js';
import { findConflictingRooms, isRoomOccupiedError, ROOM_OCCUPIED_MESSAGE } from '../../utils/checkReservationConflict.js';
import { calculateStayTotal } from '../../utils/calculateStayTotal.js';

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

        const extraRoomIds = [...new Set(extra_room_ids ?? [])].filter((rid) => rid !== room_id);
        const allRoomIds = [room_id, ...extraRoomIds];

        // Validar todos os quartos ANTES de iniciar qualquer escrita no banco.
        const room = await RoomModel.findOne({ where: { id: room_id, tenant_id: tenantId } });
        if (!room) return response.status(404).json({ error: 'Quarto não encontrado' });
        for (const rid of extraRoomIds) {
            const extraRoom = await RoomModel.findOne({ where: { id: rid, tenant_id: tenantId } });
            if (!extraRoom) return response.status(404).json({ error: `Quarto extra não encontrado: ${rid}` });
        }

        // TODOS os quartos — o principal e os extras — contra TODOS os ocupados no período,
        // principais e extras de outras reservas (P-1). Antes, o extra só era conferido quanto
        // a existir, nunca quanto a estar livre.
        const conflicting = await findConflictingRooms(allRoomIds, check_in_date, check_out_date, null, tenantId);
        if (conflicting.length > 0) {
            return response.status(409).json({ error: ROOM_OCCUPIED_MESSAGE, room_ids: conflicting });
        }

        // Total soma todos os quartos (P-4) — mesma função da alteração.
        const stay = await calculateStayTotal({ roomIds: allRoomIds, checkInDate: check_in_date, checkOutDate: check_out_date, tenantId });
        if (stay.error) return response.status(stay.error.status).json({ error: stay.error.message });

        // Transação: reserva + quartos extras são atômicos. O quarto principal entra no pivô
        // pelo próprio banco (trigger reservations_sincroniza_quartos) — inseri-lo aqui
        // duplicaria a linha. O EXCLUDE do pivô recusa a corrida que passou pela checagem acima.
        const transaction = await sequelize.transaction();
        try {
            const reservation = await ReservationModel.create({
                tenant_id: tenantId,
                guest_id,
                room_id,
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
            await transaction.rollback();
            throw txError;
        }
    } catch (error) {
        if (isRoomOccupiedError(error)) return response.status(409).json({ error: ROOM_OCCUPIED_MESSAGE });
        console.error(error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
