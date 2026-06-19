import RoomCategoryModel from '../../Models/RoomCategoryModel.js';

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
        console.error(error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
