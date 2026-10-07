import RoomCategoryModel from '../../Models/RoomCategoryModel.js';
import uniqueConstraintConflict from '../../utils/uniqueConstraintConflict.js';

export default async function CreateRoomCategoryController(request, response) {
    try {
        const tenantId = request.user.tenantId;
        const { name, capacity, price_per_night } = request.body;

        const errors = [];
        if (!name)             errors.push('name obrigatório');
        if (!price_per_night)  errors.push('price_per_night obrigatório');
        if (errors.length) return response.status(400).json({ errors });

        const category = await RoomCategoryModel.create({
            tenant_id: tenantId,
            name,
            capacity: capacity || 1,
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
