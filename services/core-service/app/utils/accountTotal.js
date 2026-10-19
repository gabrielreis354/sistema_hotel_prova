import { literal } from 'sequelize';
import AccountItemModel from '../Models/AccountItemModel.js';

/**
 * Total cobrável de uma conta: soma dos itens faturáveis e não excluídos.
 *
 * Cortesia (`billable: false`) fica de fora, mas o valor dela continua gravado no
 * item (RN-007). Item excluído fica de fora pelo paranoid do model.
 *
 * A soma é feita no Postgres e volta como texto ('24.00'), no mesmo formato dos
 * DECIMAL do resto da API — somar em JS com float acumularia erro de centavo.
 * NUMERIC(14,2): a soma de vários itens pode passar do (10,2) de um item só.
 *
 * Usada no lançamento (CA-04.1.e), no GET da conta e, depois, no /bill (T-04.3).
 *
 * @param {string} accountId
 * @param {import('sequelize').Transaction} [transaction] para ler o que a própria
 *   transação acabou de gravar
 * @returns {Promise<string>}
 */
export default async function accountTotal(accountId, transaction) {
    const [row] = await AccountItemModel.findAll({
        attributes: [[literal('COALESCE(SUM("total"), 0)::numeric(14,2)::text'), 'total']],
        where: { account_id: accountId, billable: true },
        raw: true,
        transaction
    });
    return row.total;
}
