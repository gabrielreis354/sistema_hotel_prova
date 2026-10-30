import sequelize from '../../../database/connections/sequelize.js';
import RoomModel from '../../Models/RoomModel.js';
import RoomCategoryModel from '../../Models/RoomCategoryModel.js';
import uniqueConstraintConflict from '../../utils/uniqueConstraintConflict.js';
import findInTenant from '../../utils/findInTenant.js';
import { ROOM_STATUSES, floorError, numberError, parseInteger, isManualRoomTransitionAllowed } from '../../utils/roomRules.js';
import { ROOM_ERROR_CODES, roomError, invalidInputBody } from '../../utils/roomErrors.js';

export default async function UpdateRoomController(request, response) {
    // Quarto lido com lock: um check-in ou check-out simultâneo (que muda o status na mesma
    // linha) não pode ser sobrescrito por uma edição que leu o status anterior.
    let transaction;
    const fail = async (status, body) => {
        await transaction.rollback();
        return response.status(status).json(body);
    };
    try {
        const { id } = request.params;
        const tenantId = request.user.tenantId;
        const { category_id, number, floor, status } = request.body;

        const issues = [];
        if (status !== undefined && !ROOM_STATUSES.includes(status)) {
            issues.push({ field: 'status', message: `Status inválido. Valores permitidos: ${ROOM_STATUSES.join(', ')}` });
        }
        const invalidNumber = numberError(number, { partial: true });
        if (invalidNumber) issues.push({ field: 'number', message: invalidNumber });
        const invalidFloor = floorError(floor);
        if (invalidFloor) issues.push({ field: 'floor', message: invalidFloor });
        if (issues.length) return response.status(400).json(invalidInputBody(issues));

        transaction = await sequelize.transaction();
        // findInTenant: :id que não é UUID responde 404, não 500 do cast no Postgres (🟡-3).
        const room = await findInTenant(RoomModel, id, tenantId, { transaction, lock: transaction.LOCK.UPDATE });
        if (!room) return await fail(404, { error: 'Quarto não encontrado' });

        // A categoria nova precisa ser deste hotel. A FK só confere que o id existe: antes,
        // o quarto do hotel A passava a apontar para a categoria do hotel B — o GET devolvia
        // nome, diária e tenant_id de B e a reserva era cobrada pela diária de B (R-1).
        let category;
        if (category_id !== undefined) {
            // FOR SHARE: uma categoria excluída no meio não é gravada no quarto (🟡-1 do qa-redteam de 30/10).
            category = await findInTenant(RoomCategoryModel, category_id, tenantId, { transaction, lock: transaction.LOCK.SHARE });
            if (!category) return await fail(404, roomError(ROOM_ERROR_CODES.CATEGORY_NOT_FOUND, 'Categoria não encontrada'));
        }

        // Transição, não só valor válido (R-3): OCCUPIED e CLEANING são do check-in e do check-out.
        if (status !== undefined && !isManualRoomTransitionAllowed(room.status, status)) {
            return await fail(409, roomError(
                ROOM_ERROR_CODES.ROOM_STATUS_TRANSITION_NOT_ALLOWED,
                `Quarto em ${room.status} não pode ir para ${status} pela edição — use o check-in, o check-out ou conclua a limpeza`
            ));
        }

        // Id canônico do banco, não o texto do corpo (🟢-5); número aparado (🟡-2).
        if (category)                  room.category_id = category.id;
        if (number !== undefined)      room.number = number.trim();
        if (floor !== undefined)       room.floor = floor === null ? null : parseInteger(floor);
        if (status !== undefined)      room.status = status;

        await room.save({ transaction });
        await transaction.commit();
        return response.json(room);
    } catch (error) {
        if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
        // Race no check-then-act acima: o índice único barra a segunda gravação.
        // Sem isto o conflito do cliente viraria 500.
        const conflito = uniqueConstraintConflict(error, response);
        if (conflito) return conflito;
        console.error(error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
