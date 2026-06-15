import RoomModel from '../../Models/RoomModel.js';

export default async function CreateRoomController(request, response) {
    try {
        const tenantId = request.user.tenantId;
        const { category_id, number, floor, status } = request.body;

        const errors = [];
        if (!category_id) errors.push('category_id obrigatório');
        if (!number)      errors.push('number obrigatório');
        if (errors.length) return response.status(400).json({ errors });

        const room = await RoomModel.create({
            tenant_id: tenantId,
            category_id,
            number,
            floor: floor || null,
            status: status || 'AVAILABLE'
        });
        return response.status(201).json(room);
    } catch (error) {
        console.error(error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
