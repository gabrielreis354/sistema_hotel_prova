import sequelize from '../../database/connections/sequelize.js';

/**
 * A reserva ainda tem consumo antigo, vivo, que não foi migrado para account_items?
 *
 * Enquanto tiver, o bill e a lista antiga não podem responder: sem esses consumos o
 * valor sairia menor e o hotel cobraria errado (D-31). Acontece quando a migração deixa
 * uma reserva para trás por dado inválido, ou no intervalo entre os pods novos subirem
 * e o `migrate` rodar.
 *
 * Só olha consumo não excluído: o excluído não muda valor nenhum.
 *
 * Duas consultas de propósito: uma consulta que cite `consumptions` falha na análise
 * quando a tabela não existe (banco novo), mesmo atrás de um CASE.
 *
 * @param {string} reservationId
 * @param {import('sequelize').Transaction} [transaction] quem já segura uma conexão de
 *   transação passa a sua: pedir outra ao pool com a primeira presa esgota o pool sob
 *   carga (🟡-2 do qa-redteam da T-04.3)
 * @returns {Promise<boolean>}
 */
export default async function pendingLegacyConsumption(reservationId, transaction) {
    const [[{ existe }]] = await sequelize.query(
        `SELECT to_regclass('public.consumptions') IS NOT NULL AS existe`,
        { transaction }
    );
    if (!existe) return false;

    const [[{ pendente }]] = await sequelize.query(`
        SELECT EXISTS (
            SELECT 1 FROM consumptions c
            WHERE c.reservation_id = :reservationId AND c.deleted_at IS NULL
              AND NOT EXISTS (SELECT 1 FROM account_items ai WHERE ai.id = c.id)
        ) AS pendente`,
    { replacements: { reservationId }, transaction });
    return pendente;
}
