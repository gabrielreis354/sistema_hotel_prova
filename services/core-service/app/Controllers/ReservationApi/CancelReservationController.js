import sequelize from '../../../database/connections/sequelize.js';
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
    const { id } = request.params;
    const tenantId = request.user.tenantId;

    // Lida com lock dentro da transação: um check-in simultâneo não pode ser sobrescrito por um
    // CANCELLED (hóspede no quarto e quarto liberado para venda) — reauditoria de 10/10, N4.
    let transaction;
    const fail = async (status, body) => {
        await transaction.rollback();
        return response.status(status).json(body);
    };
    try {
        transaction = await sequelize.transaction();
        const reservation = await ReservationModel.findOne({ where: { id, tenant_id: tenantId }, lock: transaction.LOCK.UPDATE, transaction });
        if (!reservation) return await fail(404, { error: 'Reserva não encontrada' });

        // Reserva-bloco de contrato: cancelá-la aqui liberaria os quartos do contrato com ele
        // ainda SIGNED — e cancelar contrato é decisão do ADMIN (P-3). Cancela-se pelo contrato.
        if (reservation.source === 'B2B') {
            return await fail(409, { error: 'Reserva-bloco de contrato: cancele pelo contrato (PUT /contracts/:id/cancel)' });
        }

        if (!CANCELLABLE_STATUSES.includes(reservation.status)) {
            const message = CANCEL_BLOCKED_MESSAGES[reservation.status]
                ?? `Cancelamento não permitido no status '${reservation.status}'`;
            return await fail(422, { error: message });
        }

        reservation.status = 'CANCELLED';
        await reservation.save({ transaction });
        await transaction.commit();

        return response.json(reservation);
    } catch (error) {
        if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
        console.error(error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
