import RoomModel from '../../Models/RoomModel.js';
import RoomCategoryModel from '../../Models/RoomCategoryModel.js';

export default async function GetRoomController(request, response) {
    try {
        const { id } = request.params;
        const tenantId = request.user.tenantId;
        const room = await RoomModel.findOne({
            where: { id, tenant_id: tenantId },
            include: [{ model: RoomCategoryModel, as: 'category' }]
        });
        if (!room) return response.status(404).json({ error: 'Quarto não encontrado' });
        return response.json(room);
    } catch (error) {
        console.error(error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
