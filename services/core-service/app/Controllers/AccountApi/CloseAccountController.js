import sequelize from '../../../database/connections/sequelize.js';
import AccountModel from '../../Models/AccountModel.js';
import ReservationModel from '../../Models/ReservationModel.js';
import isUuid from '../../utils/isUuid.js';
import accountBill, { closeAccount } from '../../utils/accountBill.js';
import pendingLegacyConsumption from '../../utils/pendingLegacyConsumption.js';

/**
 * PUT /accounts/:id/close
 * Fecha a conta: OPEN → CLOSED (CA-04.3.g). Responde com o bill da conta fechada.
 *
 * - Conta fechada não recebe item nem perde item (D-23): o que foi apresentado ao
 *   cliente não muda mais.
 * - A conta que cobra a diária só fecha com a estadia encerrada (N-1). As outras fecham
 *   com o hóspede ainda hospedado: acertar o bar antes de sair é rotina. O encerramento
 *   da estadia fecha o que sobrar (closeReservationAccounts, D-36).
 * - CLOSED → PAID é da T-04.4.
 */
const ENDED_STAY_STATUSES = ['CHECKED_OUT', 'CANCELLED'];

export default async function CloseAccountController(request, response) {
    try {
        const { id } = request.params;
        const tenantId = request.user.tenantId;

        // :id não-UUID chega ao Postgres como cast inválido e viraria 500.
        if (!isUuid(id)) return response.status(404).json({ error: 'Conta não encontrada' });

        const transaction = await sequelize.transaction();
        try {
            // Trava a conta: o lançamento e a exclusão de item travam a mesma linha, então
            // nenhum item entra ou sai entre o fechamento e o bill que ele devolve.
            const account = await AccountModel.findOne({
                where: { id, tenant_id: tenantId },
                lock: transaction.LOCK.UPDATE,
                transaction
            });
            if (!account) {
                await transaction.rollback();
                return response.status(404).json({ error: 'Conta não encontrada' });
            }

            if (account.status !== 'OPEN') {
                await transaction.rollback();
                return response.status(422).json({ error: `Conta ${account.status} não pode ser fechada` });
            }

            // Fechar com consumo antigo fora da conta apresentaria um total menor (D-31).
            // Na transação: segurar esta conexão e pedir outra esgotava o pool (🟡-2).
            if (account.reservation_id && await pendingLegacyConsumption(account.reservation_id, transaction)) {
                await transaction.rollback();
                return response.status(503).json({ error: 'Consumos desta reserva em migração — conta temporariamente indisponível' });
            }

            // A conta que cobra a diária só fecha com a estadia encerrada (N-1 da reauditoria).
            // Fechada antes, ela gravaria a diária e não acompanharia uma prorrogação ou um
            // encurtamento: com uma conta por reserva, não sobra conta aberta para absorver a
            // diferença. Allowlist: só estadia encerrada libera. Reserva excluída não é
            // encontrada (paranoid) e também libera — a conta sobrou da corrida da D-36.
            if (account.type === 'ROOM' && account.charges_lodging) {
                const stay = await ReservationModel.findOne({
                    where: { id: account.reservation_id, tenant_id: tenantId }, attributes: ['status'], transaction
                });
                if (stay && !ENDED_STAY_STATUSES.includes(stay.status)) {
                    await transaction.rollback();
                    return response.status(422).json({
                        error: 'A conta que cobra a diária fecha no check-out ou no cancelamento da reserva. Para acertar o consumo antes, use uma conta sem diária'
                    });
                }
            }

            // Grava a diária apresentada: conta fechada não muda de valor depois (D-39).
            await closeAccount(account, transaction);

            const bill = await accountBill(account, transaction);
            await transaction.commit();
            return response.json(bill);
        } catch (error) {
            await transaction.rollback();
            throw error;
        }
    } catch (error) {
        console.error('CloseAccountController:', error.message);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
