import sequelize from '../../../database/connections/sequelize.js';
import RoomCategoryModel from '../../Models/RoomCategoryModel.js';
import RoomModel from '../../Models/RoomModel.js';
import { ROOM_ERROR_CODES, roomError } from '../../utils/roomErrors.js';

export default async function DeleteRoomCategoryController(request, response) {
    // Categoria travada (FOR UPDATE) antes da contagem, como o quarto no DeleteRoom: quem grava
    // um quarto nela lê a categoria com FOR SHARE, então a contagem só roda depois que esse
    // quarto confirmou e o enxerga → 409 (🟡-1 do qa-redteam de 30/10). Sem a trava, a contagem
    // dava 0 e a categoria era excluída com um quarto novo dentro.
    let transaction;
    const fail = async (status, body) => {
        await transaction.rollback();
        return response.status(status).json(body);
    };
    try {
        const { id } = request.params;
        const tenantId = request.user.tenantId;

        transaction = await sequelize.transaction();
        const category = await RoomCategoryModel.findOne({ where: { id, tenant_id: tenantId }, lock: transaction.LOCK.UPDATE, transaction });
        if (!category) return await fail(404, { error: 'Categoria não encontrada' });

        // R-4: a exclusão é lógica, então a FK (ON DELETE RESTRICT) não barra. O quarto ficava
        // "sem categoria" na tela e a reserva seguia cobrando a diária da categoria excluída.
        // Só quarto vivo conta: o excluído não é mais vendido.
        const roomsInUse = await RoomModel.count({ where: { category_id: category.id, tenant_id: tenantId }, transaction });
        if (roomsInUse > 0) {
            return await fail(409, roomError(
                ROOM_ERROR_CODES.CATEGORY_IN_USE,
                `Categoria em uso por ${roomsInUse} quarto(s) — mova-os para outra categoria antes de excluir`
            ));
        }

        await category.destroy({ transaction });
        await transaction.commit();
        return response.status(204).send();
    } catch (error) {
        if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
        console.error(error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
