import RoomCategoryModel from '../../Models/RoomCategoryModel.js';
import uniqueConstraintConflict from '../../utils/uniqueConstraintConflict.js';
import { validateRoomCategoryFields } from '../../utils/roomCategoryValidation.js';
import { parseInteger } from '../../utils/roomRules.js';
import { invalidInputBody } from '../../utils/roomErrors.js';

export default async function CreateRoomCategoryController(request, response) {
    try {
        const tenantId = request.user.tenantId;
        const { name, capacity, price_per_night } = request.body;

        // R-5: diária decimal positiva com até 2 casas e capacidade inteira ≥ 1 — antes,
        // negativo era gravado e texto ou estouro viravam 500.
        const issues = validateRoomCategoryFields({ name, capacity, price_per_night });
        if (issues.length) return response.status(400).json(invalidInputBody(issues));

        const category = await RoomCategoryModel.create({
            tenant_id: tenantId,
            // Aparado, como o produto (🟢-3): "P " ao lado de "P" eram duas categorias na tela.
            name: name.trim(),
            // Ausente vale 1. Antes `capacity || 1` trocava 0 por 1 em silêncio; agora 0 é 400.
            capacity: capacity === undefined || capacity === null ? 1 : parseInteger(capacity),
            price_per_night
        });
        return response.status(201).json(category);
    } catch (error) {
        // Race no check-then-act acima: o índice único barra a segunda gravação.
        // Sem isto o conflito do cliente viraria 500.
        const conflito = uniqueConstraintConflict(error, response);
        if (conflito) return conflito;
        console.error(error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
