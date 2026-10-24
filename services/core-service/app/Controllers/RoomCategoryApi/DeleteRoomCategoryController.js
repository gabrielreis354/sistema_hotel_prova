import RoomCategoryModel from '../../Models/RoomCategoryModel.js';
import RoomModel from '../../Models/RoomModel.js';

export default async function DeleteRoomCategoryController(request, response) {
    try {
        const { id } = request.params;
        const tenantId = request.user.tenantId;
        const category = await RoomCategoryModel.findOne({ where: { id, tenant_id: tenantId } });
        if (!category) return response.status(404).json({ error: 'Categoria não encontrada' });

        // R-4: a exclusão é lógica, então a FK (ON DELETE RESTRICT) não barra. O quarto ficava
        // "sem categoria" na tela e a reserva seguia cobrando a diária da categoria excluída.
        // Só quarto vivo conta: o excluído não é mais vendido.
        const roomsInUse = await RoomModel.count({ where: { category_id: category.id, tenant_id: tenantId } });
        if (roomsInUse > 0) {
            return response.status(409).json({ error: `Categoria em uso por ${roomsInUse} quarto(s) — mova-os para outra categoria antes de excluir` });
        }

        await category.destroy();
        return response.status(204).send();
    } catch (error) {
        console.error(error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
