import sequelize from '../../../database/connections/sequelize.js';
import ReservationModel from '../../Models/ReservationModel.js';
import RoomModel from '../../Models/RoomModel.js';
import ReservationRoomModel from '../../Models/ReservationRoomModel.js';

export default async function CheckOutController(request, response) {
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

        if (!['CHECKED_IN'].includes(reservation.status)) {
            return await fail(422, { error: 'Check-out só possível quando status for CHECKED_IN' });
        }

        const room = await RoomModel.findOne({ where: { id: reservation.room_id, tenant_id: tenantId }, transaction });
        if (!room) return await fail(404, { error: 'Quarto da reserva não encontrado' });

        reservation.status = 'CHECKED_OUT';
        room.status = 'CLEANING';
        await reservation.save({ transaction });
        await room.save({ transaction });

        const pivotRows = await ReservationRoomModel.findAll({ where: { reservation_id: reservation.id }, transaction });
        const extraRoomIds = pivotRows
            .map(r => r.room_id)
            .filter(rid => rid !== reservation.room_id);

        if (extraRoomIds.length > 0) {
            await RoomModel.update(
                { status: 'CLEANING' },
                { where: { id: extraRoomIds, tenant_id: tenantId }, transaction }
            );
        }

        await transaction.commit();
        return response.json(reservation);
    } catch (error) {
        if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
        console.error(error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
