import ReservationModel from '../../Models/ReservationModel.js';
import GuestModel from '../../Models/GuestModel.js';
import RoomModel from '../../Models/RoomModel.js';
import UserModel from '../../Models/UserModel.js';
import ReservationRoomModel from '../../Models/ReservationRoomModel.js';

export default async function GetReservationController(request, response) {
    try {
        const { id } = request.params;
        const tenantId = request.user.tenantId;
        const reservation = await ReservationModel.findOne({
            where: { id, tenant_id: tenantId },
            include: [
                { model: GuestModel, as: 'guest' },
                { model: RoomModel,  as: 'room' },
                { model: UserModel,  as: 'user', attributes: ['id', 'name'] },
                { model: RoomModel,  as: 'rooms', through: { attributes: [] } }
            ]
        });
        if (!reservation) return response.status(404).json({ error: 'Reserva não encontrada' });
        return response.json(reservation);
    } catch (error) {
        console.error(error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
