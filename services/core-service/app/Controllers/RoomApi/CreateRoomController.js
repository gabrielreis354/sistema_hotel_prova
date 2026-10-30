import sequelize from '../../../database/connections/sequelize.js';
import RoomModel from '../../Models/RoomModel.js';
import RoomCategoryModel from '../../Models/RoomCategoryModel.js';
import uniqueConstraintConflict from '../../utils/uniqueConstraintConflict.js';
import findInTenant from '../../utils/findInTenant.js';
import { CREATABLE_ROOM_STATUSES, floorError, numberError, parseInteger } from '../../utils/roomRules.js';
import { ROOM_ERROR_CODES, roomError, invalidInputBody } from '../../utils/roomErrors.js';

export default async function CreateRoomController(request, response) {
    let transaction;
    try {
        const tenantId = request.user.tenantId;
        const { category_id, number, floor, status } = request.body;

        const issues = [];
        if (!category_id) issues.push({ field: 'category_id', message: 'category_id obrigatório' });
        const invalidNumber = numberError(number);
        if (invalidNumber) issues.push({ field: 'number', message: invalidNumber });
        const invalidFloor = floorError(floor);
        if (invalidFloor) issues.push({ field: 'floor', message: invalidFloor });
        // Allowlist (R-3): quarto novo não nasce OCCUPIED nem CLEANING — isso é check-in e check-out.
        if (status !== undefined && status !== null && !CREATABLE_ROOM_STATUSES.includes(status)) {
            issues.push({ field: 'status', message: `status no cadastro deve ser um de: ${CREATABLE_ROOM_STATUSES.join(', ')}` });
        }
        if (issues.length) return response.status(400).json(invalidInputBody(issues));

        // Valida a FK antes de inserir, no tenant: sem isso, um category_id inexistente
        // estoura a foreign key no banco (500) e o de outro hotel seria aceito. Lida com
        // FOR SHARE na mesma transação do INSERT (🟡-1 do qa-redteam de 30/10): a FK não
        // enxerga deleted_at, e uma categoria excluída no meio virava quarto "sem categoria".
        transaction = await sequelize.transaction();
        const category = await findInTenant(RoomCategoryModel, category_id, tenantId, { transaction, lock: transaction.LOCK.SHARE });
        if (!category) {
            await transaction.rollback();
            return response.status(404).json(roomError(ROOM_ERROR_CODES.CATEGORY_NOT_FOUND, 'Categoria não encontrada'));
        }

        const room = await RoomModel.create({
            tenant_id: tenantId,
            // Id canônico do banco, não o texto do corpo (🟢-5): o UUID em maiúsculas passava
            // e a resposta divergia do GET.
            category_id: category.id,
            number: number.trim(),
            // `??`, não `||`: o térreo (0) virava null (R-2).
            floor: floor === undefined || floor === null ? null : parseInteger(floor),
            status: status ?? 'AVAILABLE'
        }, { transaction });
        await transaction.commit();
        return response.status(201).json(room);
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
