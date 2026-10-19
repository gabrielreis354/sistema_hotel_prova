/**
 * Correção de dados da T-04.3: fecha as contas que ficaram abertas em estadias já
 * encerradas (D-37, achado N-5 da reauditoria da T-04.2).
 *
 * Até a T-04.3, nada fechava conta: o check-out, o cancelamento e a exclusão da reserva
 * deixavam a conta da suíte OPEN para sempre, na lista do garçom. Daqui em diante o
 * encerramento fecha (app/utils/closeReservationAccounts.js); isto conserta o que já está
 * no banco, e as sobras de uma corrida entre abrir conta e encerrar a estadia.
 *
 * Roda no `node command.js migrate`, sempre. Idempotente: na segunda vez, fecha 0.
 * closed_at = agora: a hora real do encerramento não está registrada, e não é inventada.
 *
 * @param {import('sequelize').Sequelize} sequelize
 * @param {{ log?: (msg: string) => void }} [options]
 * @returns {Promise<{ closed: number }>}
 */
export default async function closeEndedStayAccounts(sequelize, { log = () => {} } = {}) {
    const [rows] = await sequelize.query(`
        UPDATE accounts a
           SET status = 'CLOSED', closed_at = now(), updated_at = now()
          FROM reservations r
         WHERE a.reservation_id = r.id
           AND a.status = 'OPEN'
           AND a.deleted_at IS NULL
           AND (r.status IN ('CHECKED_OUT', 'CANCELLED') OR r.deleted_at IS NOT NULL)
        RETURNING a.id`);

    if (rows.length > 0) log(`✅ Contas de estadias encerradas fechadas: ${rows.length}`);
    return { closed: rows.length };
}
