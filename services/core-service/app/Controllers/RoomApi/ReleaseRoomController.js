import { Op } from 'sequelize';
import sequelize from '../../../database/connections/sequelize.js';
import RoomModel from '../../Models/RoomModel.js';
import ReservationModel from '../../Models/ReservationModel.js';
import ReservationRoomModel from '../../Models/ReservationRoomModel.js';
import findInTenant from '../../utils/findInTenant.js';
import { ROOM_ERROR_CODES, roomError } from '../../utils/roomErrors.js';

// Única transição deste endpoint (allowlist): a limpeza concluída.
const RELEASABLE_FROM = ['CLEANING'];
const RELEASED_TO = 'AVAILABLE';

/**
 * PUT /rooms/:id/release — conclui a limpeza (CLEANING → AVAILABLE).
 *
 * D-1 da T-05.3 (decisão do Gabriel de 04/11/2026): a recepção libera o quarto pelo painel
 * "Hoje" sem ganhar o PUT /rooms/:id genérico, que continua só do ADMIN. Endpoint dedicado para
 * a máquina de estados (CLAUDE.md §7), como check-in, check-out e cancel.
 *
 * Lock na linha: um check-in simultâneo no mesmo quarto não é sobrescrito por uma liberação que
 * leu o status anterior. O evento de quarto sai do trigger do outbox, como em qualquer UPDATE.
 */
export default async function ReleaseRoomController(request, response) {
    let transaction;
    try {
        const tenantId = request.user.tenantId;
        transaction = await sequelize.transaction();

        // findInTenant: outro hotel ou :id que não é UUID respondem 404, não 500.
        const room = await findInTenant(RoomModel, request.params.id, tenantId, { transaction, lock: transaction.LOCK.UPDATE });
        if (!room) {
            await transaction.rollback();
            return response.status(404).json({ error: 'Quarto não encontrado' });
        }

        if (!RELEASABLE_FROM.includes(room.status)) {
            await transaction.rollback();
            return response.status(409).json(roomError(
                ROOM_ERROR_CODES.ROOM_STATUS_TRANSITION_NOT_ALLOWED,
                `Só quarto em limpeza pode ser liberado — o quarto ${room.number} está em ${room.status}`
            ));
        }

        // Defesa em profundidade (🟡-3 do qa-redteam da T-05.3): CLEANING não prova quarto vazio.
        // Quarto extra só aparece na pivot, por isso as duas origens.
        const pivotRows = await ReservationRoomModel.findAll({ where: { room_id: room.id }, attributes: ['reservation_id'], transaction });
        const guestsInside = await ReservationModel.count({
            where: {
                tenant_id: tenantId,
                status: 'CHECKED_IN',
                [Op.or]: [{ room_id: room.id }, { id: pivotRows.map(p => p.reservation_id) }],
            },
            transaction,
        });
        if (guestsInside > 0) {
            await transaction.rollback();
            return response.status(409).json(roomError(
                ROOM_ERROR_CODES.ROOM_STATUS_TRANSITION_NOT_ALLOWED,
                `O quarto ${room.number} ainda tem hóspede na casa — faça o check-out antes de liberar`
            ));
        }

        room.status = RELEASED_TO;
        await room.save({ transaction });
        await transaction.commit();
        return response.json(room);
    } catch (error) {
        if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
        console.error('ReleaseRoomController:', error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
