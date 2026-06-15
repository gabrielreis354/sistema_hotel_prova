import sequelize from '../../../database/connections/sequelize.js';
import ReservationModel from '../../Models/ReservationModel.js';
import RoomModel from '../../Models/RoomModel.js';

export default async function CheckInController(request, response) {
    const { id } = request.params;
    const tenantId = request.user.tenantId;

    const reservation = await ReservationModel.findOne({ where: { id, tenant_id: tenantId } });
    if (!reservation) return response.status(404).json({ error: 'Reserva não encontrada' });

    if (!['PENDING', 'CONFIRMED'].includes(reservation.status)) {
        return response.status(422).json({ error: `Check-in não permitido no status '${reservation.status}'` });
    }

    const room = await RoomModel.findOne({ where: { id: reservation.room_id, tenant_id: tenantId } });
    if (!room) return response.status(404).json({ error: 'Quarto da reserva não encontrado' });

    try {
        await sequelize.transaction(async (t) => {
            reservation.status = 'CHECKED_IN';
            room.status = 'OCCUPIED';
            await reservation.save({ transaction: t });
            await room.save({ transaction: t });
        });

        return response.json(reservation);
    } catch (error) {
        console.error(error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
