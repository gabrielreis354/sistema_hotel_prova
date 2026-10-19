import { Op } from 'sequelize';
import AccountModel from '../app/Models/AccountModel.js';
import { closeAccount, lodgingShare } from '../app/utils/accountBill.js';

/**
 * Correção de dados da T-04.3, rodada a cada `node command.js migrate`. Idempotente.
 *
 * 1. Fecha as contas que ficaram abertas em estadias já encerradas (D-37, N-5 da
 *    reauditoria da T-04.2). Até a T-04.3, nada fechava conta: o check-out, o
 *    cancelamento e a exclusão da reserva deixavam a conta da suíte OPEN para sempre, na
 *    lista do garçom. Daqui em diante o encerramento fecha (closeReservationAccounts);
 *    isto conserta o que já está no banco e as sobras de uma corrida entre abrir conta e
 *    encerrar a estadia. closed_at = agora: a hora real não está registrada e não é inventada.
 *
 * 2. Grava a diária das contas fechadas que ainda não a têm (D-39): as fechadas antes da
 *    T-04.3, inclusive as que a migração da T-04.2 criou CLOSED (D-30). Uma a uma, por
 *    reserva: cada conta gravada entra como gravada no rateio da seguinte, e a soma fecha
 *    no total da reserva.
 *
 * Numa transação só: ou tudo, ou nada.
 *
 * @param {import('sequelize').Sequelize} sequelize
 * @param {{ log?: (msg: string) => void }} [options]
 * @returns {Promise<{ closed: number, recorded: number }>}
 */
export default async function closeEndedStayAccounts(sequelize, { log = () => {} } = {}) {
    const result = await sequelize.transaction(async (transaction) => {
        const [ended] = await sequelize.query(`
            SELECT a.id
              FROM accounts a
              JOIN reservations r ON r.id = a.reservation_id
             WHERE a.status = 'OPEN'
               AND a.deleted_at IS NULL
               AND (r.status IN ('CHECKED_OUT', 'CANCELLED') OR r.deleted_at IS NOT NULL)
             ORDER BY a.id
               FOR UPDATE OF a`, { transaction });

        const toClose = await AccountModel.findAll({
            where: { id: ended.map((row) => row.id) },
            order: [['reservation_id', 'ASC'], ['id', 'ASC']],
            transaction
        });
        for (const account of toClose) await closeAccount(account, transaction);

        const missing = await AccountModel.findAll({
            where: { status: { [Op.ne]: 'OPEN' }, closed_room_charges: null },
            order: [['reservation_id', 'ASC'], ['closed_at', 'ASC'], ['id', 'ASC']],
            lock: transaction.LOCK.UPDATE,
            transaction
        });
        for (const account of missing) {
            const charges = account.type === 'INTERNAL' ? '0.00' : await lodgingShare(account, transaction);
            await AccountModel.update({ closed_room_charges: charges }, { where: { id: account.id }, transaction });
        }

        return { closed: toClose.length, recorded: missing.length };
    });

    if (result.closed > 0) log(`✅ Contas de estadias encerradas fechadas: ${result.closed}`);
    if (result.recorded > 0) log(`✅ Diária gravada em contas fechadas antes da T-04.3: ${result.recorded}`);
    return result;
}
