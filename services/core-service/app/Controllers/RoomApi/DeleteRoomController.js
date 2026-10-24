import sequelize from '../../../database/connections/sequelize.js';
import RoomModel from '../../Models/RoomModel.js';
import ReservationModel from '../../Models/ReservationModel.js';
import ReservationRoomModel from '../../Models/ReservationRoomModel.js';
import { ROOM_HOLDING_RESERVATION_STATUSES } from '../../utils/roomRules.js';

export default async function DeleteRoomController(request, response) {
    // Quarto travado durante a checagem: a inserção de uma reserva para ele (FK no pivô) espera.
    let transaction;
    const fail = async (status, body) => {
        await transaction.rollback();
        return response.status(status).json(body);
    };
    try {
        const { id } = request.params;
        const tenantId = request.user.tenantId;

        transaction = await sequelize.transaction();
        const room = await RoomModel.findOne({ where: { id, tenant_id: tenantId }, lock: transaction.LOCK.UPDATE, transaction });
        if (!room) return await fail(404, { error: 'Quarto não encontrado' });

        // R-6: excluir um quarto com hóspede dentro, ou prometido a uma reserva (principal ou
        // extra — o pivô tem os dois), deixava a reserva sem onde hospedar.
        if (room.status === 'OCCUPIED') {
            return await fail(409, { error: 'Quarto ocupado não pode ser excluído — faça o check-out antes' });
        }
        const holding = await ReservationRoomModel.findOne({
            where: { room_id: room.id },
            include: [{
                model: ReservationModel,
                as: 'reservation',
                required: true,
                attributes: ['id'],
                where: { tenant_id: tenantId, status: ROOM_HOLDING_RESERVATION_STATUSES }
            }],
            transaction
        });
        if (holding) {
            return await fail(409, { error: 'Quarto com reserva ativa não pode ser excluído — cancele ou mova a reserva antes' });
        }

        await room.destroy({ transaction });
        await transaction.commit();
        return response.status(204).send();
    } catch (error) {
        if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
        console.error(error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
