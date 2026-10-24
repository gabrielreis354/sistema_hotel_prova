import sequelize from '../../../database/connections/sequelize.js';
import ReservationModel from '../../Models/ReservationModel.js';
import ReservationRoomModel from '../../Models/ReservationRoomModel.js';
import { recalculateReservationTotal } from '../../utils/recalculateReservationTotal.js';
import { reservationChangeBlocked } from '../../utils/reservationChangeGuard.js';
import { moveRemovedRoomAccounts } from '../../utils/roomChangeAccounts.js';

// PostgreSQL: "deadlock detected". A transação vítima volta inteira, então tentar de novo é seguro.
const isDeadlock = (error) => (error?.parent ?? error?.original)?.code === '40P01';
const DEADLOCK_ATTEMPTS = 2;

/**
 * Uma tentativa da remoção, numa transação só. Devolve { status, body } ou lança.
 * A transação é aberta DENTRO do try: uma falha do banco (pool esgotado, rollback que falha)
 * vira erro tratado — sem isso, a rejeição escapava do handler e o Node encerrava o processo
 * (reauditoria de 10/10, N2).
 */
async function removeOnce(id, roomId, tenantId) {
    const transaction = await sequelize.transaction();
    const done = async (status, body) => {
        await transaction.rollback();
        return { status, body };
    };
    try {
        const reservation = await ReservationModel.findOne({ where: { id, tenant_id: tenantId }, lock: transaction.LOCK.UPDATE, transaction });
        if (!reservation) return await done(404, { error: 'Reserva não encontrada' });

        const blocked = reservationChangeBlocked(reservation);
        if (blocked) return await done(blocked.status, { error: blocked.message });

        const pivot = await ReservationRoomModel.findOne({ where: { reservation_id: id, room_id: roomId }, transaction });
        if (!pivot) return await done(404, { error: 'Quarto não vinculado a esta reserva' });

        // Compara pelo valor que o BANCO devolveu, não pelo texto da URL: o PostgreSQL aceita o
        // UUID em maiúsculas ou sem hífens, e a comparação com o texto deixava apagar o principal
        // (total 0,00 e quarto revendível — achado do /security-review de 10/10). O principal
        // mora em reservations.room_id; troca-se pelo PUT.
        if (pivot.room_id === reservation.room_id) {
            return await done(409, { error: 'O quarto principal não pode ser removido — troque-o pelo PUT /reservations/:id' });
        }

        // As contas abertas do extra vão para o quarto principal, com consumo e pagamentos
        // (repasse do qa-redteam de 19/10; 🟡-1 e 🟡-2 da auditoria de 21/10): nenhuma fica
        // apontando para fora da estadia, nenhuma é apagada, e a diária nunca fica sem conta.
        await moveRemovedRoomAccounts(reservation, pivot.room_id, transaction);

        await pivot.destroy({ transaction });
        const recalculated = await recalculateReservationTotal(reservation, tenantId, transaction);
        if (recalculated.error) return await done(recalculated.error.status, { error: recalculated.error.message });

        await transaction.commit();
        return { status: 204 };
    } catch (error) {
        if (!transaction.finished) await transaction.rollback().catch(() => {});
        throw error;
    }
}

export default async function RemoveRoomFromReservationController(request, response) {
    const { id, roomId } = request.params;
    const tenantId = request.user.tenantId;

    try {
        // Defesa contra deadlock (N-1 da reauditoria delta de 21/10): os caminhos que mexem em
        // conta de suíte travam a reserva primeiro (D-48), mas se o banco ainda escolher esta
        // transação como vítima, ela volta inteira — tenta de novo uma vez; se repetir, 409
        // claro para a recepção repetir. Nunca 500 por uma corrida esperada.
        for (let attempt = 1; ; attempt += 1) {
            try {
                const { status, body } = await removeOnce(id, roomId, tenantId);
                return body ? response.status(status).json(body) : response.status(status).send();
            } catch (error) {
                if (!isDeadlock(error)) throw error;
                console.warn('RemoveRoomFromReservationController: deadlock na remoção', { reservation_id: id, attempt });
                if (attempt >= DEADLOCK_ATTEMPTS) {
                    return response.status(409).json({ error: 'A reserva está sendo alterada por outra operação agora — tente de novo' });
                }
            }
        }
    } catch (error) {
        console.error(error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
