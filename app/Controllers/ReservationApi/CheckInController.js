import ReservationModel from '../../Models/ReservationModel.js';

export default async function CheckInController(request, response) {
    try {
        const { id } = request.params;
        const tenantId = request.user.tenantId;
        const reservation = await ReservationModel.findOne({ where: { id, tenant_id: tenantId } });
        if (!reservation) return response.status(404).json({ error: 'Reserva não encontrada' });
        if (!['PENDING', 'CONFIRMED'].includes(reservation.status)) {
            return response.status(422).json({ error: `Check-in não permitido no status '${reservation.status}'` });
        }
        reservation.status = 'CHECKED_IN';
        await reservation.save();
        return response.json(reservation);
    } catch (error) {
        console.error(error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
