import RoomCategoryModel from '../../Models/RoomCategoryModel.js';

export default async function GetRoomCategoryController(request, response) {
    try {
        const { id } = request.params;
        const tenantId = request.user.tenantId;
        const category = await RoomCategoryModel.findOne({ where: { id, tenant_id: tenantId } });
        if (!category) return response.status(404).json({ error: 'Categoria não encontrada' });
        return response.json(category);
    } catch (error) {
        console.error(error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
