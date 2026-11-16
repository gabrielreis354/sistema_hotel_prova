import sequelize from '../../../database/connections/sequelize.js';
import GuestModel from '../../Models/GuestModel.js';
import ReservationModel from '../../Models/ReservationModel.js';
import findInTenant from '../../utils/findInTenant.js';
import { ACTIVE_RESERVATION_STATUSES } from '../../utils/reservationStatuses.js';

/**
 * Exclui (soft delete) o hóspede. Com reserva ativa (PENDING, CONFIRMED ou CHECKED_IN) recusa com
 * 409: a reserva passava a mostrar "Hóspede removido" no check-out e no recibo, sem volta pela
 * tela (decisão do Sirlande de 16/11, repasse do red team da T-08.5). Mesmo molde do
 * DeleteRoomController.
 *
 * O hóspede fica travado (FOR UPDATE) entre a checagem e a exclusão. Limitação conhecida: quem cria
 * reserva ainda lê o hóspede sem trava, então uma reserva criada no mesmo instante da exclusão pode
 * escapar — num hotel pequeno, improvável; fica para quando a criação ler com KEY SHARE.
 */
export default async function DeleteGuestController(request, response) {
    let transaction;
    const fail = async (status, body) => {
        await transaction.rollback();
        return response.status(status).json(body);
    };
    try {
        const { id } = request.params;
        const tenantId = request.user.tenantId;

        transaction = await sequelize.transaction();
        const guest = await findInTenant(GuestModel, id, tenantId, { transaction, lock: transaction.LOCK.UPDATE });
        if (!guest) return await fail(404, { error: 'Hóspede não encontrado' });

        const active = await ReservationModel.findOne({
            where: { guest_id: guest.id, tenant_id: tenantId, status: ACTIVE_RESERVATION_STATUSES },
            attributes: ['id'],
            transaction
        });
        if (active) {
            return await fail(409, { error: 'Hóspede com reserva ativa não pode ser excluído — encerre ou cancele a reserva antes' });
        }

        await guest.destroy({ transaction });
        await transaction.commit();
        return response.status(204).send();
    } catch (error) {
        if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
        console.error('DeleteGuestController:', error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
