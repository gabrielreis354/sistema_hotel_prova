import ReservationModel from '../../Models/ReservationModel.js';

export default async function CheckOutController(request, response) {
    try {
        const { id } = request.params;
        const tenantId = request.user.tenantId;
        const reservation = await ReservationModel.findOne({ where: { id, tenant_id: tenantId } });
        if (!reservation) return response.status(404).json({ error: 'Reserva não encontrada' });
        if (reservation.status !== 'CHECKED_IN') {
            return response.status(422).json({ error: `Check-out só possível quando status for CHECKED_IN` });
        }
        reservation.status = 'CHECKED_OUT';
        await reservation.save();
        return response.json(reservation);
    } catch (error) {
        console.error(error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
