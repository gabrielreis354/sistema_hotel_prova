import sequelize from '../../../database/connections/sequelize.js';
import ReservationModel from '../../Models/ReservationModel.js';
import RoomModel from '../../Models/RoomModel.js';
import ReservationRoomModel from '../../Models/ReservationRoomModel.js';

export default async function CheckInController(request, response) {
    const { id } = request.params;
    const tenantId = request.user.tenantId;

    // Reserva e quartos lidos com lock DENTRO da transação: um cancelamento de contrato (ou
    // outra transição) simultâneo não pode gravar por cima — antes, a leitura era feita fora,
    // e um check-in podia sobrescrever um CANCELLED recém-confirmado.
    const transaction = await sequelize.transaction();
    const fail = async (status, body) => {
        await transaction.rollback();
        return response.status(status).json(body);
    };
    try {
        const reservation = await ReservationModel.findOne({ where: { id, tenant_id: tenantId }, lock: transaction.LOCK.UPDATE, transaction });
        if (!reservation) return fail(404, { error: 'Reserva não encontrada' });

        if (!['PENDING', 'CONFIRMED'].includes(reservation.status)) {
            return fail(422, { error: `Check-in não permitido no status '${reservation.status}'` });
        }

        const room = await RoomModel.findOne({ where: { id: reservation.room_id, tenant_id: tenantId }, transaction });
        if (!room) return fail(404, { error: 'Quarto da reserva não encontrado' });

        reservation.status = 'CHECKED_IN';
        room.status = 'OCCUPIED';
        await reservation.save({ transaction });
        await room.save({ transaction });

        const pivotRows = await ReservationRoomModel.findAll({ where: { reservation_id: reservation.id }, transaction });
        const extraRoomIds = pivotRows
            .map(r => r.room_id)
            .filter(rid => rid !== reservation.room_id);

        if (extraRoomIds.length > 0) {
            await RoomModel.update(
                { status: 'OCCUPIED' },
                { where: { id: extraRoomIds, tenant_id: tenantId }, transaction }
            );
        }

        await transaction.commit();
        return response.json(reservation);
    } catch (error) {
        if (!transaction.finished) await transaction.rollback();
        console.error(error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
