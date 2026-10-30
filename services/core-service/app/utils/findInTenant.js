import isUuid from './isUuid.js';

/**
 * Busca um registro pelo id DENTRO do tenant — para ids de outra entidade que chegam no
 * corpo da requisição (category_id, guest_id, room_id...).
 *
 * A foreign key do banco só confere que o id existe, não que é do mesmo hotel: sem esta
 * busca, o hotel A passava a apontar para a categoria do hotel B e cobrava a diária dela
 * (R-1 do qa-redteam de 21/10). Devolve null quando o id não é UUID (o cast inválido no
 * Postgres viraria 500), não existe, é de outro tenant ou foi excluído (paranoid) — quem
 * chama responde 404 nos três casos, sem confirmar que o id existe em outro hotel.
 *
 * @param {import('sequelize').ModelStatic<any>} Model
 * @param {unknown} id
 * @param {string} tenantId — sempre do JWT (request.user.tenantId)
 * Quem vai GRAVAR uma referência ao registro lê com `lock: transaction.LOCK.SHARE` dentro da
 * própria transação (🟡-1 do qa-redteam de 30/10): a FK não enxerga `deleted_at`, então uma
 * exclusão que acontecesse entre a leitura e a gravação deixava a referência apontando para um
 * registro excluído. Com FOR SHARE a leitura espera a exclusão em curso (FOR UPDATE) e, depois
 * da espera, o Postgres reavalia o `deleted_at IS NULL` — o registro excluído some e vira 404.
 *
 * @param {{ transaction?: import('sequelize').Transaction, lock?: unknown }} [options]
 */
export default async function findInTenant(Model, id, tenantId, { transaction, lock } = {}) {
    if (!isUuid(id)) return null;
    return Model.findOne({ where: { id, tenant_id: tenantId }, transaction, ...(lock ? { lock } : {}) });
}
