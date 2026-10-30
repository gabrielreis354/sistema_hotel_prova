import sequelize from '../../../database/connections/sequelize.js';
import RoomModel from '../../Models/RoomModel.js';
import ReservationModel from '../../Models/ReservationModel.js';
import ReservationRoomModel from '../../Models/ReservationRoomModel.js';
import { ROOM_HOLDING_RESERVATION_STATUSES } from '../../utils/roomRules.js';
import { ROOM_ERROR_CODES, roomError } from '../../utils/roomErrors.js';

export default async function DeleteRoomController(request, response) {
    // Quarto travado (FOR UPDATE) durante a checagem e a exclusão. Isso fecha a corrida nos dois
    // sentidos só porque quem grava reserva lê o quarto com FOR SHARE na própria transação:
    // - a reserva chegou antes: esta exclusão espera ela confirmar e a enxerga → 409;
    // - a exclusão chegou antes: a leitura da reserva espera, reavalia deleted_at e não acha o
    //   quarto → 404. Sem o FOR SHARE do outro lado, o INSERT só esperava a trava e gravava
    //   assim mesmo, porque a FK não enxerga deleted_at (🟡-1 do qa-redteam de 30/10).
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
            return await fail(409, roomError(ROOM_ERROR_CODES.ROOM_IN_USE, 'Quarto ocupado não pode ser excluído — faça o check-out antes'));
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
            return await fail(409, roomError(ROOM_ERROR_CODES.ROOM_IN_USE, 'Quarto com reserva ativa não pode ser excluído — cancele ou mova a reserva antes'));
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
