import RoomModel from '../../Models/RoomModel.js';

export default async function DeleteRoomController(request, response) {
    try {
        const { id } = request.params;
        const tenantId = request.user.tenantId;
        const room = await RoomModel.findOne({ where: { id, tenant_id: tenantId } });
        if (!room) return response.status(404).json({ error: 'Quarto não encontrado' });
        await room.destroy();
        return response.status(204).send();
    } catch (error) {
        console.error(error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
