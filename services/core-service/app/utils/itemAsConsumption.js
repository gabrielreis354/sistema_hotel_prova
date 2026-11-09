import { Op } from 'sequelize';
import AccountModel from '../Models/AccountModel.js';
import AccountItemModel from '../Models/AccountItemModel.js';
import UserModel from '../Models/UserModel.js';

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
 * para os dois nunca divergirem. `transaction` opcional: o bill lê tudo na mesma foto (D-57).
 */
export function reservationConsumptionItems(reservationId, tenantId, transaction) {
    return AccountItemModel.findAll({
        where: { tenant_id: tenantId, billable: true },
        include: [{
            model: AccountModel,
            as: 'account',
            where: { reservation_id: reservationId, tenant_id: tenantId },
            attributes: []
        }],
        order: [['consumed_at', 'ASC'], ['created_at', 'ASC']],
        transaction
    });
}

/**
 * Consumos estornados de uma reserva (M5-c, CA-05.2.j): itens faturáveis excluídos de
 * qualquer conta da reserva, com quem autorizou. Estorno é a exclusão lógica do item, só
 * ADMIN, com deleted_by (D-7, D-8).
 *
 * - Só faturáveis, o mesmo filtro dos consumos (D-70): cortesia excluída nunca foi cobrada.
 * - Quem autorizou vem mesmo removido do sistema (paranoid: false no usuário, D-71), e só
 *   dele: id e nome. O usuário também é filtrado pelo hotel — nunca um nome de outro tenant.
 * - Em ordem de estorno, o mais antigo primeiro.
 * - Limitação (🟡 do qa-redteam de 09/11): lê só account_items. Um estorno antigo da tabela
 *   consumptions ainda não migrado (janela antes do migrate) não aparece, e o
 *   pendingLegacyConsumption do bill só barra consumo VIVO pendente. Os totais não mudam;
 *   só o histórico fica incompleto até o migrate.
 *
 * @param {string} reservationId
 * @param {string} tenantId
 * @param {import('sequelize').Transaction} [transaction] a mesma foto do bill (D-57)
 */
export function reservationVoidedItems(reservationId, tenantId, transaction) {
    return AccountItemModel.findAll({
        where: { tenant_id: tenantId, billable: true, deleted_at: { [Op.ne]: null } },
        paranoid: false,
        include: [
            {
                model: AccountModel,
                as: 'account',
                where: { reservation_id: reservationId, tenant_id: tenantId },
                attributes: []
            },
            {
                model: UserModel,
                as: 'deleter',
                where: { tenant_id: tenantId },
                required: false,
                paranoid: false,
                attributes: ['id', 'name']
            }
        ],
        order: [['deleted_at', 'ASC'], ['id', 'ASC']],
        transaction
    });
}
