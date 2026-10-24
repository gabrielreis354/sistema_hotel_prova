import RoomModel from '../../Models/RoomModel.js';
import RoomCategoryModel from '../../Models/RoomCategoryModel.js';
import uniqueConstraintConflict from '../../utils/uniqueConstraintConflict.js';
import findInTenant from '../../utils/findInTenant.js';

const VALID_ROOM_STATUSES = ['AVAILABLE', 'OCCUPIED', 'CLEANING', 'MAINTENANCE'];

export default async function UpdateRoomController(request, response) {
    try {
        const { id } = request.params;
        const tenantId = request.user.tenantId;
        const { category_id, number, floor, status } = request.body;

        if (status !== undefined && !VALID_ROOM_STATUSES.includes(status)) {
            return response.status(400).json({
                error: `Status inválido. Valores permitidos: ${VALID_ROOM_STATUSES.join(', ')}`
            });
        }

        const room = await RoomModel.findOne({ where: { id, tenant_id: tenantId } });
        if (!room) return response.status(404).json({ error: 'Quarto não encontrado' });

        // A categoria nova precisa ser deste hotel. A FK só confere que o id existe: antes,
        // o quarto do hotel A passava a apontar para a categoria do hotel B — o GET devolvia
        // nome, diária e tenant_id de B e a reserva era cobrada pela diária de B (R-1).
        if (category_id !== undefined) {
            const category = await findInTenant(RoomCategoryModel, category_id, tenantId);
            if (!category) return response.status(404).json({ error: 'Categoria não encontrada' });
        }

        if (category_id !== undefined) room.category_id = category_id;
        if (number !== undefined)      room.number = number;
        if (floor !== undefined)       room.floor = floor;
        if (status !== undefined)      room.status = status;

        await room.save();
        return response.json(room);
    } catch (error) {
        // Race no check-then-act acima: o índice único barra a segunda gravação.
        // Sem isto o conflito do cliente viraria 500.
        const conflito = uniqueConstraintConflict(error, response);
        if (conflito) return conflito;
        console.error(error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
