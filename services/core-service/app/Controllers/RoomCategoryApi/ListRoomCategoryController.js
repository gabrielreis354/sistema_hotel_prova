import RoomCategoryModel from '../../Models/RoomCategoryModel.js';
import { logError } from '../../utils/logError.js';

export default async function ListRoomCategoryController(request, response) {
    try {
        const tenantId = request.user.tenantId;
        const categories = await RoomCategoryModel.findAll({ where: { tenant_id: tenantId } });
        return response.json(categories);
    } catch (error) {
        logError('ListRoomCategoryController', error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
