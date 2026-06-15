import ReservationModel from '../../Models/ReservationModel.js';
import GuestModel from '../../Models/GuestModel.js';
import RoomModel from '../../Models/RoomModel.js';
import UserModel from '../../Models/UserModel.js';

export default async function ListReservationController(request, response) {
    try {
        const tenantId = request.user.tenantId;
        const reservations = await ReservationModel.findAll({
            where: { tenant_id: tenantId },
            include: [
                { model: GuestModel, as: 'guest', attributes: ['id', 'full_name', 'email'] },
                { model: RoomModel,  as: 'room',  attributes: ['id', 'number', 'floor'] },
                { model: UserModel,  as: 'user',  attributes: ['id', 'name'] }
            ]
        });
        return response.json(reservations);
    } catch (error) {
        console.error(error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
