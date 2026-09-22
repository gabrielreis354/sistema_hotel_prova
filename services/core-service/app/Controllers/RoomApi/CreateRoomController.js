import RoomModel from '../../Models/RoomModel.js';
import RoomCategoryModel from '../../Models/RoomCategoryModel.js';
import uniqueConstraintConflict from '../../utils/uniqueConstraintConflict.js';

export default async function CreateRoomController(request, response) {
    try {
        const tenantId = request.user.tenantId;
        const { category_id, number, floor, status } = request.body;

        const errors = [];
        if (!category_id) errors.push('category_id obrigatório');
        if (!number)      errors.push('number obrigatório');
        if (errors.length) return response.status(400).json({ errors });

        // Valida a FK antes de inserir: sem isso, um category_id inexistente
        // estoura a foreign key no banco e retorna 500 genérico.
        const category = await RoomCategoryModel.findOne({
            where: { id: category_id, tenant_id: tenantId }
        });
        if (!category) return response.status(404).json({ error: 'Categoria não encontrada' });

        const room = await RoomModel.create({
            tenant_id: tenantId,
            category_id,
            number,
            floor: floor || null,
            status: status || 'AVAILABLE'
        });
        return response.status(201).json(room);
    } catch (error) {
        // Race no check-then-act acima: o índice único barra a segunda gravação.
        // Sem isto o conflito do cliente viraria 500.
        const conflito = uniqueConstraintConflict(error, response);
        if (conflito) return conflito;
        console.error(error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
