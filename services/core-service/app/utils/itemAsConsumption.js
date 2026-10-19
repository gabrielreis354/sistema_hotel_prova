import AccountModel from '../Models/AccountModel.js';
import AccountItemModel from '../Models/AccountItemModel.js';

/**
 * Item de conta no formato do consumo antigo (contrato de /reservations/:id/consumptions).
 *
 * As rotas antigas continuam respondendo igual (CA-04.2.d) embora o dado viva em
 * account_items desde a T-04.2. O id é o do item — que, para consumo migrado, é o
 * mesmo id do consumo original, então links e DELETEs antigos continuam valendo.
 *
 * @param {import('sequelize').Model|object} item
 * @param {string} reservationId
 */
export default function itemAsConsumption(item, reservationId) {
    return {
        id: item.id,
        tenant_id: item.tenant_id,
        reservation_id: reservationId,
        description: item.description,
        amount: item.total,
        consumed_at: item.consumed_at,
        deleted_by: item.deleted_by,
        created_at: item.created_at,
        updated_at: item.updated_at,
        deleted_at: item.deleted_at
    };
}

/**
 * Itens que o contrato antigo chama de "consumos" de uma reserva: faturáveis e não
 * excluídos, de TODAS as contas da reserva (inclusive a conta dividida de um
 * acompanhante), em ordem de consumo. Cortesia fica de fora: não é consumo cobrado,
 * e o formato antigo não tem como dizer "este não conta". Usado pela lista e pelo bill,
 * para os dois nunca divergirem.
 */
export function reservationConsumptionItems(reservationId, tenantId) {
    return AccountItemModel.findAll({
        where: { tenant_id: tenantId, billable: true },
        include: [{
            model: AccountModel,
            as: 'account',
            where: { reservation_id: reservationId, tenant_id: tenantId },
            attributes: []
        }],
        order: [['consumed_at', 'ASC'], ['created_at', 'ASC']]
    });
}
