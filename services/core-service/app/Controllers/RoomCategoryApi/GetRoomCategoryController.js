import RoomCategoryModel from '../../Models/RoomCategoryModel.js';
import { logError } from '../../utils/logError.js';

export default async function GetRoomCategoryController(request, response) {
    try {
        const { id } = request.params;
        const tenantId = request.user.tenantId;
        const category = await RoomCategoryModel.findOne({ where: { id, tenant_id: tenantId } });
        if (!category) return response.status(404).json({ error: 'Categoria não encontrada' });
        return response.json(category);
    } catch (error) {
        logError('GetRoomCategoryController', error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
