import sequelize from '../../../database/connections/sequelize.js';
import ReservationModel from '../../Models/ReservationModel.js';
import RoomModel from '../../Models/RoomModel.js';
import ReservationRoomModel from '../../Models/ReservationRoomModel.js';
import { openStayAccount } from '../../utils/reservationRoomAccount.js';
import { ROOM_ERROR_CODES, roomError } from '../../utils/roomErrors.js';

const CHECK_IN_FROM = 'AVAILABLE';

const UNAVAILABLE_LABEL = { OCCUPIED: 'ainda ocupado', CLEANING: 'em limpeza', MAINTENANCE: 'em manutenção' };

function unavailableMessage(room) {
    return `Quarto ${room.number} ${UNAVAILABLE_LABEL[room.status] ?? 'indisponível'}: o check-in precisa do quarto livre`;
}

export default async function CheckInController(request, response) {
    const { id } = request.params;
    const tenantId = request.user.tenantId;

    // Reserva e quartos lidos com lock DENTRO da transação: um cancelamento de contrato (ou
    // outra transição) simultâneo não pode gravar por cima — antes, a leitura era feita fora,
    // e um check-in podia sobrescrever um CANCELLED recém-confirmado.
    // `return await fail(...)`, e a transação aberta DENTRO do try: uma falha do banco (pool
    // esgotado, rollback que falha) cai no catch e vira 500 — sem isso, a rejeição escapava do
    // handler e o Node encerrava o processo inteiro (reauditoria de 10/10, N2).
    let transaction;
    const fail = async (status, body) => {
        await transaction.rollback();
        return response.status(status).json(body);
    };
    try {
        transaction = await sequelize.transaction();
        const reservation = await ReservationModel.findOne({ where: { id, tenant_id: tenantId }, lock: transaction.LOCK.UPDATE, transaction });
        if (!reservation) return await fail(404, { error: 'Reserva não encontrada' });

        if (!['PENDING', 'CONFIRMED'].includes(reservation.status)) {
            return await fail(422, { error: `Check-in não permitido no status '${reservation.status}'` });
        }

        const pivotRows = await ReservationRoomModel.findAll({ where: { reservation_id: reservation.id }, transaction });
        const extraRoomIds = pivotRows
            .map(r => r.room_id)
            .filter(rid => rid !== reservation.room_id);

        // Quartos travados em ordem de id: dois check-ins que dividem quartos não se bloqueiam em
        // ciclo, e um release ou edição simultânea espera este status ser gravado.
        const rooms = await RoomModel.findAll({
            where: { id: [reservation.room_id, ...extraRoomIds], tenant_id: tenantId },
            order: [['id', 'ASC']],
            lock: transaction.LOCK.UPDATE,
            transaction,
        });
        const room = rooms.find(r => r.id === reservation.room_id);
        if (!room) return await fail(404, { error: 'Quarto da reserva não encontrado' });

        // Allowlist (CLAUDE.md §3 e §7): o check-in só leva AVAILABLE → OCCUPIED. Sem isto, a
        // chegada entrava no quarto de uma saída atrasada e o check-out do primeiro hóspede
        // devolvia o quarto à venda com o segundo dentro (🔴 do qa-redteam da T-05.3).
        const blocked = rooms.find(r => r.status !== CHECK_IN_FROM);
        if (blocked) {
            return await fail(409, roomError(ROOM_ERROR_CODES.ROOM_NOT_AVAILABLE, unavailableMessage(blocked)));
        }

        reservation.status = 'CHECKED_IN';
        room.status = 'OCCUPIED';
        await reservation.save({ transaction });
        await room.save({ transaction });

        if (extraRoomIds.length > 0) {
            await RoomModel.update(
                { status: 'OCCUPIED' },
                { where: { id: extraRoomIds, tenant_id: tenantId }, transaction }
            );
        }

        // A conta da suíte nasce com o check-in, na mesma transação (T-04.6, D-58): falhou a
        // conta, o check-in volta inteiro (CA-04.6.c). A resposta segue sendo a reserva (D-59).
        await openStayAccount(reservation, room, transaction);

        await transaction.commit();
        return response.json(reservation);
    } catch (error) {
        if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
        console.error(error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
