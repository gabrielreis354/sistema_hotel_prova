import RoomCategoryModel from '../../Models/RoomCategoryModel.js';
import uniqueConstraintConflict from '../../utils/uniqueConstraintConflict.js';
import { validateRoomCategoryFields } from '../../utils/roomCategoryValidation.js';
import { parseInteger } from '../../utils/roomRules.js';
import { invalidInputBody } from '../../utils/roomErrors.js';

export default async function UpdateRoomCategoryController(request, response) {
    try {
        const { id } = request.params;
        const tenantId = request.user.tenantId;
        const { name, capacity, price_per_night } = request.body;

        // Mesmas regras do cadastro, só no que veio (R-5).
        const issues = validateRoomCategoryFields({ name, capacity, price_per_night }, { partial: true });
        if (issues.length) return response.status(400).json(invalidInputBody(issues));

        const category = await RoomCategoryModel.findOne({ where: { id, tenant_id: tenantId } });
        if (!category) return response.status(404).json({ error: 'Categoria não encontrada' });

        if (name !== undefined)            category.name = name;
        if (capacity !== undefined)        category.capacity = parseInteger(capacity);
        if (price_per_night !== undefined) category.price_per_night = price_per_night;

        await category.save();
        return response.json(category);
    } catch (error) {
        // Race no check-then-act acima: o índice único barra a segunda gravação.
        // Sem isto o conflito do cliente viraria 500.
        const conflito = uniqueConstraintConflict(error, response);
        if (conflito) return conflito;
        console.error(error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
