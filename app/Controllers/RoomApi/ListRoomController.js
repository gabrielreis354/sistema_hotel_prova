import RoomModel from '../../Models/RoomModel.js';
import RoomCategoryModel from '../../Models/RoomCategoryModel.js';

export default async function ListRoomController(request, response) {
    try {
        const tenantId = request.user.tenantId;
        const rooms = await RoomModel.findAll({
            where: { tenant_id: tenantId },
            include: [{ model: RoomCategoryModel, as: 'category', attributes: ['id', 'name', 'price_per_night'] }]
        });
        return response.json(rooms);
    } catch (error) {
        console.error(error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
