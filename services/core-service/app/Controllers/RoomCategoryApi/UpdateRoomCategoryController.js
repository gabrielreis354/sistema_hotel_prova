import RoomCategoryModel from '../../Models/RoomCategoryModel.js';
import uniqueConstraintConflict from '../../utils/uniqueConstraintConflict.js';
import { validateRoomCategoryFields } from '../../utils/roomCategoryValidation.js';
import { parseInteger } from '../../utils/roomRules.js';
import { invalidInputBody } from '../../utils/roomErrors.js';
import findInTenant from '../../utils/findInTenant.js';
import { logError } from '../../utils/logError.js';
import { categoryNameTaken } from '../../utils/categoryNameTaken.js';

export default async function UpdateRoomCategoryController(request, response) {
    try {
        const { id } = request.params;
        const tenantId = request.user.tenantId;
        const { name, capacity, price_per_night } = request.body;

        // Mesmas regras do cadastro, só no que veio (R-5).
        const issues = validateRoomCategoryFields({ name, capacity, price_per_night }, { partial: true });
        if (issues.length) return response.status(400).json(invalidInputBody(issues));

        // findInTenant: :id que não é UUID responde 404, não 500 do cast no Postgres (🟡-3).
        const category = await findInTenant(RoomCategoryModel, id, tenantId);
        if (!category) return response.status(404).json({ error: 'Categoria não encontrada' });

        // Mesmo nome de OUTRA categoria em outra caixa → 409; a própria pode mudar a caixa.
        if (name !== undefined) {
            const taken = await categoryNameTaken(tenantId, name.trim(), category.id);
            if (taken) return response.status(409).json(taken);
        }

        // Aparado, como o produto (🟢-3): "P " ao lado de "P" eram duas categorias na tela.
        if (name !== undefined)            category.name = name.trim();
        if (capacity !== undefined)        category.capacity = parseInteger(capacity);
        if (price_per_night !== undefined) category.price_per_night = price_per_night;

        await category.save();
        return response.json(category);
    } catch (error) {
        // Race no check-then-act acima: o índice único barra a segunda gravação.
        // Sem isto o conflito do cliente viraria 500.
        const conflito = uniqueConstraintConflict(error, response);
        if (conflito) return conflito;
        logError('UpdateRoomCategoryController', error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
