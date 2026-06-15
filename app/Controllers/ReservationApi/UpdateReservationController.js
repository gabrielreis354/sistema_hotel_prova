import ReservationModel from '../../Models/ReservationModel.js';
import { checkReservationConflict } from '../../utils/checkReservationConflict.js';

// Campos permitidos para atualização via PUT.
// Mudanças de status são exclusividade dos endpoints dedicados:
// PUT /:id/check-in | PUT /:id/check-out | PUT /:id/cancel
export default async function UpdateReservationController(request, response) {
    try {
        const { id } = request.params;
        const tenantId = request.user.tenantId;
        const { guest_id, room_id, check_in_date, check_out_date, total_amount } = request.body;

        const reservation = await ReservationModel.findOne({ where: { id, tenant_id: tenantId } });
        if (!reservation) return response.status(404).json({ error: 'Reserva não encontrada' });

        // Se quarto ou datas mudarem, verifica conflito excluindo a própria reserva
        const datesOrRoomChanged = room_id !== undefined || check_in_date !== undefined || check_out_date !== undefined;
        if (datesOrRoomChanged) {
            const checkRoomId    = room_id       ?? reservation.room_id;
            const checkInDate    = check_in_date  ?? reservation.check_in_date;
            const checkOutDate   = check_out_date ?? reservation.check_out_date;

            const hasConflict = await checkReservationConflict(checkRoomId, checkInDate, checkOutDate, reservation.id, tenantId);
            if (hasConflict) {
                return response.status(409).json({ error: 'Quarto indisponível no período solicitado' });
            }
        }

        if (guest_id !== undefined)       reservation.guest_id = guest_id;
        if (room_id !== undefined)        reservation.room_id = room_id;
        if (check_in_date !== undefined)  reservation.check_in_date = check_in_date;
        if (check_out_date !== undefined) reservation.check_out_date = check_out_date;
        if (total_amount !== undefined)   reservation.total_amount = total_amount;

        await reservation.save();
        return response.json(reservation);
    } catch (error) {
        console.error(error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
