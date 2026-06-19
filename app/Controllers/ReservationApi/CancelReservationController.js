import ReservationModel from '../../Models/ReservationModel.js';

// Allowlist explícita: apenas esses status podem ser cancelados.
// Qualquer outro status (incluindo futuros) é bloqueado por padrão — fail-safe.
const CANCELLABLE_STATUSES = ['PENDING', 'CONFIRMED'];

const CANCEL_BLOCKED_MESSAGES = {
    CHECKED_IN:  'Não é possível cancelar uma reserva com hóspede no quarto',
    CHECKED_OUT: 'Reserva já encerrada',
    CANCELLED:   'Reserva já cancelada'
};

export default async function CancelReservationController(request, response) {
    try {
        const { id } = request.params;
        const tenantId = request.user.tenantId;

        const reservation = await ReservationModel.findOne({ where: { id, tenant_id: tenantId } });
        if (!reservation) return response.status(404).json({ error: 'Reserva não encontrada' });

        if (!CANCELLABLE_STATUSES.includes(reservation.status)) {
            const message = CANCEL_BLOCKED_MESSAGES[reservation.status]
                ?? `Cancelamento não permitido no status '${reservation.status}'`;
            return response.status(422).json({ error: message });
        }

        reservation.status = 'CANCELLED';
        await reservation.save();

        return response.json(reservation);
    } catch (error) {
        console.error(error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
