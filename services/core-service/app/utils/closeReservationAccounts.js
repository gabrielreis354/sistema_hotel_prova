import AccountModel from '../Models/AccountModel.js';
import { closeAccount } from './accountBill.js';
import { creditOrder } from './accountPayments.js';

/**
 * Fecha as contas ainda abertas de uma reserva que acabou de encerrar (D-36).
 *
 * Chamada na transação de quem encerra a estadia — check-out, cancelamento, cancelamento
 * do contrato B2B e exclusão da reserva — depois de gravar o novo status: a diária que
 * cada conta grava (D-39) já sai 0 na reserva cancelada ou excluída (D-35). Se o
 * fechamento falha, o encerramento volta atrás junto.
 *
 * Conta já fechada ou paga não é tocada (o closed_at e a diária dela continuam os originais).
 *
 * Trava as contas antes de fechar: um lançamento em andamento termina antes, e o item dele
 * entra no que foi fechado. Quem lança trava a conta e lê a reserva sem trava, e quem
 * encerra trava a reserva e depois as contas — sem ordem cruzada, sem deadlock. Em ordem
 * de id, para dois encerramentos nunca travarem as mesmas contas em ordens diferentes.
 *
 * Uma a uma: cada conta fechada já entra como gravada no rateio da seguinte, e a soma
 * das diárias fecha no total da reserva. Fecha a titular primeiro (D-62).
 *
 * @param {import('sequelize').Model} reservation já travada e validada no tenant
 * @param {import('sequelize').Transaction} transaction obrigatória
 * @returns {Promise<number>} quantas contas foram fechadas
 */
export default async function closeReservationAccounts(reservation, transaction) {
    // Sem transação, um encerramento que falhasse depois deixaria as contas fechadas.
    if (!transaction) throw new Error('closeReservationAccounts exige a transação do encerramento');

    const open = await AccountModel.findAll({
        where: { reservation_id: reservation.id, tenant_id: reservation.tenant_id, status: 'OPEN' },
        order: [['id', 'ASC']],
        lock: transaction.LOCK.UPDATE,
        transaction
    });
    // Trava em ordem de id; fecha na ordem do crédito da reserva, com a titular primeiro
    // (D-42, D-45, D-62). O crédito preenche as fechadas pela ordem em que fecharam: fechando
    // pela ordem de id, o sinal do titular podia pagar o consumo do acompanhante, conforme o
    // sorteio dos UUIDs.
    for (const account of creditOrder(open)) await closeAccount(account, transaction);
    return open.length;
}
