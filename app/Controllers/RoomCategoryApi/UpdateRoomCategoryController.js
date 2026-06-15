import RoomCategoryModel from '../../Models/RoomCategoryModel.js';

export default async function UpdateRoomCategoryController(request, response) {
    try {
        const { id } = request.params;
        const tenantId = request.user.tenantId;
        const { name, capacity, price_per_night } = request.body;

        const category = await RoomCategoryModel.findOne({ where: { id, tenant_id: tenantId } });
        if (!category) return response.status(404).json({ error: 'Categoria não encontrada' });

        if (name !== undefined)            category.name = name;
        if (capacity !== undefined)        category.capacity = capacity;
        if (price_per_night !== undefined) category.price_per_night = price_per_night;

        await category.save();
        return response.json(category);
    } catch (error) {
        console.error(error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
