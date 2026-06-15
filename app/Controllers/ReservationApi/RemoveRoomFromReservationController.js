import ReservationModel from '../../Models/ReservationModel.js';
import ReservationRoomModel from '../../Models/ReservationRoomModel.js';

export default async function RemoveRoomFromReservationController(request, response) {
    try {
        const { id, roomId } = request.params;
        const tenantId = request.user.tenantId;

        const reservation = await ReservationModel.findOne({ where: { id, tenant_id: tenantId } });
        if (!reservation) return response.status(404).json({ error: 'Reserva não encontrada' });

        const pivot = await ReservationRoomModel.findOne({ where: { reservation_id: id, room_id: roomId } });
        if (!pivot) return response.status(404).json({ error: 'Quarto não vinculado a esta reserva' });

        await pivot.destroy();
        return response.status(204).send();
    } catch (error) {
        console.error(error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
