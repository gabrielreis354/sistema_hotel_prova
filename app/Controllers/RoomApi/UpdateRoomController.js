import RoomModel from '../../Models/RoomModel.js';

export default async function UpdateRoomController(request, response) {
    try {
        const { id } = request.params;
        const tenantId = request.user.tenantId;
        const { category_id, number, floor, status } = request.body;

        const room = await RoomModel.findOne({ where: { id, tenant_id: tenantId } });
        if (!room) return response.status(404).json({ error: 'Quarto não encontrado' });

        if (category_id !== undefined) room.category_id = category_id;
        if (number !== undefined)      room.number = number;
        if (floor !== undefined)       room.floor = floor;
        if (status !== undefined)      room.status = status;

        await room.save();
        return response.json(room);
    } catch (error) {
        console.error(error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
