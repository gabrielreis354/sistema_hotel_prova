import ReservationModel from '../../Models/ReservationModel.js';

export default async function UpdateReservationController(request, response) {
    try {
        const { id } = request.params;
        const tenantId = request.user.tenantId;
        const { guest_id, room_id, check_in_date, check_out_date, status, total_amount } = request.body;

        const reservation = await ReservationModel.findOne({ where: { id, tenant_id: tenantId } });
        if (!reservation) return response.status(404).json({ error: 'Reserva não encontrada' });

        if (guest_id !== undefined)       reservation.guest_id = guest_id;
        if (room_id !== undefined)        reservation.room_id = room_id;
        if (check_in_date !== undefined)  reservation.check_in_date = check_in_date;
        if (check_out_date !== undefined) reservation.check_out_date = check_out_date;
        if (status !== undefined)         reservation.status = status;
        if (total_amount !== undefined)   reservation.total_amount = total_amount;

        await reservation.save();
        return response.json(reservation);
    } catch (error) {
        console.error(error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
