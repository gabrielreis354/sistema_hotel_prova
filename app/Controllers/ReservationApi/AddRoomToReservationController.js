import ReservationModel from '../../Models/ReservationModel.js';
import ReservationRoomModel from '../../Models/ReservationRoomModel.js';
import RoomModel from '../../Models/RoomModel.js';

export default async function AddRoomToReservationController(request, response) {
    try {
        const { id } = request.params;
        const tenantId = request.user.tenantId;
        const { room_id } = request.body;

        if (!room_id) return response.status(400).json({ error: 'room_id obrigatório' });

        const reservation = await ReservationModel.findOne({ where: { id, tenant_id: tenantId } });
        if (!reservation) return response.status(404).json({ error: 'Reserva não encontrada' });

        const room = await RoomModel.findOne({ where: { id: room_id, tenant_id: tenantId } });
        if (!room) return response.status(404).json({ error: 'Quarto não encontrado' });

        const existing = await ReservationRoomModel.findOne({ where: { reservation_id: id, room_id } });
        if (existing) return response.status(409).json({ error: 'Quarto já vinculado a esta reserva' });

        const pivot = await ReservationRoomModel.create({ reservation_id: id, room_id });
        return response.status(201).json(pivot);
    } catch (error) {
        console.error(error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
