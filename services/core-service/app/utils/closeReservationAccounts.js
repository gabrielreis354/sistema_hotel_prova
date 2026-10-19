import AccountModel from '../Models/AccountModel.js';

/**
 * Fecha as contas ainda abertas de uma reserva que acabou de encerrar (D-36).
 *
 * Chamada na transação de quem encerra a estadia — check-out, cancelamento, cancelamento
 * do contrato B2B e exclusão da reserva. Se o fechamento falha, o encerramento volta
 * atrás junto: nunca fica reserva encerrada com conta aberta para o garçom lançar.
 *
 * Conta já fechada ou paga não é tocada (o closed_at dela continua o original).
 *
 * O UPDATE trava cada conta: um lançamento em andamento termina antes, e o item dele
 * entra no que foi fechado. Quem lança trava a conta e lê a reserva sem trava, e quem
 * encerra trava a reserva e depois as contas — sem ordem cruzada, sem deadlock.
 *
 * @param {import('sequelize').Model} reservation já travada e validada no tenant
 * @param {import('sequelize').Transaction} transaction obrigatória
 * @returns {Promise<number>} quantas contas foram fechadas
 */
export default async function closeReservationAccounts(reservation, transaction) {
    // Sem transação, um encerramento que falhasse depois deixaria as contas fechadas.
    if (!transaction) throw new Error('closeReservationAccounts exige a transação do encerramento');

    const [closed] = await AccountModel.update(
        { status: 'CLOSED', closed_at: new Date() },
        { where: { reservation_id: reservation.id, tenant_id: reservation.tenant_id, status: 'OPEN' }, transaction }
    );
    return closed;
}
