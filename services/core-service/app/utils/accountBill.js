import AccountModel from '../Models/AccountModel.js';
import AccountItemModel from '../Models/AccountItemModel.js';
import ReservationModel from '../Models/ReservationModel.js';
import { accountCharges, lodgingShare } from './accountCharges.js';
import { accountBalance, reservationLedger } from './accountPayments.js';
import sequelize from '../../database/connections/sequelize.js';
import pendingLegacyConsumption from './pendingLegacyConsumption.js';
import { toCents, fromCents } from './calculateStayTotal.js';

// lodgingShare mora em accountCharges.js; reexportado para quem já importava daqui.
export { lodgingShare };

const ZERO = '0.00';

// Campos do item que o bill mostra. Sem created_by: quem lançou é dado interno da equipe.
const ITEM_ATTRIBUTES = [
    'id', 'product_id', 'description', 'quantity', 'unit_price', 'total', 'billable', 'reason', 'consumed_at'
];

/**
 * Fecha a conta e grava a diária que ela apresenta (D-39). Usada pelo fechamento manual
 * e pelo encerramento da estadia. Calcula com a conta ainda OPEN, dentro da transação de
 * quem chama: contas fechadas na mesma transação já entram como gravadas na seguinte.
 *
 * AccountModel.update, não save(): um UPDATE só, com os três campos juntos.
 *
 * @param {import('sequelize').Model} account travada pela transação
 * @param {import('sequelize').Transaction} transaction
 */
export async function closeAccount(account, transaction) {
    // Relógio do banco, não da aplicação: a ordem das fechadas decide o crédito da reserva
    // (D-45), e réplicas com relógios defasados a inverteriam (🟢-2 da reauditoria).
    // clock_timestamp(), não now(): now() é o início da transação, e quem esperou a trava
    // da reserva começou antes de quem fechou primeiro.
    const [[{ closedAt }]] = await sequelize.query('SELECT clock_timestamp() AS "closedAt"', { transaction });
    const values = {
        status: 'CLOSED',
        closed_at: closedAt,
        closed_room_charges: account.type === 'INTERNAL' ? ZERO : await lodgingShare(account, transaction)
    };
    // Só conta aberta (N-4): regravar uma fechada mudaria o que foi apresentado (D-23, D-39).
    const [updated] = await AccountModel.update(values, {
        where: { id: account.id, tenant_id: account.tenant_id, status: 'OPEN' }, transaction
    });
    if (updated !== 1) throw new Error(`closeAccount: a conta ${account.id} não está aberta`);
    account.set(values);

    // Conta paga antes de fechar sai do fechamento já PAID (T-04.4, D-43).
    await settleAccount(account, transaction);
}

/**
 * Acerta CLOSED ↔ PAID depois de um fechamento ou de um pagamento (T-04.4, D-43).
 *
 * PAID = conta fechada, com pagamento, e saldo ≤ 0 (pagamento a maior deixa o saldo
 * negativo: o hotel deve devolver — D-44). Se o saldo volta a ficar positivo
 * (pagamento excluído ou reduzido), volta a CLOSED.
 *
 * Não mexe em:
 *   - conta OPEN: ainda recebe item, e a de diária nem fecha durante a estadia (N-1);
 *     paga por inteiro, vira PAID quando fechar;
 *   - conta INTERNAL: nunca é receita (RN-006); não tem reserva e o banco recusa
 *     pagamento nela, então nunca chega a PAID;
 *   - conta fechada com total 0 e sem pagamento direto: não há o que pagar, continua
 *     CLOSED — mesmo que a sobra do crédito da reserva caia nela (saldo negativo);
 *   - conta com consumo antigo ainda não migrado: o total sairia menor (D-31). O próximo
 *     pagamento, fechamento ou migrate acerta.
 *
 * Quem chama trava a reserva antes da conta (D-48): o que cabe a uma conta depende das
 * outras contas da reserva, e dois acertos em paralelo leriam cada um a outra ainda aberta
 * (🔴-1 da reauditoria).
 *
 * @param {import('sequelize').Model} account travada pela transação de quem chama
 * @param {import('sequelize').Transaction} transaction
 * @param {Map} [ledger] razão da reserva já calculado nesta transação (reservationLedger)
 */
export async function settleAccount(account, transaction, ledger) {
    if (!['CLOSED', 'PAID'].includes(account.status)) return;
    if (account.reservation_id && await pendingLegacyConsumption(account.reservation_id, transaction)) return;

    const { totalCents, paidCents: paymentsCents, directCents } = await accountBalance(account, transaction, ledger);
    // Conta de total 0 só fica PAID com pagamento dela: a sobra do crédito da reserva pode
    // sair dela quando outra conta passa a ter total, sem acerto (🟢-1 da 3ª rodada).
    const owns = totalCents > 0 || directCents > 0;
    const next = owns && paymentsCents > 0 && totalCents - paymentsCents <= 0 ? 'PAID' : 'CLOSED';
    if (next === account.status) return;

    const [updated] = await AccountModel.update({ status: next }, {
        where: { id: account.id, tenant_id: account.tenant_id, status: account.status }, transaction
    });
    if (updated !== 1) throw new Error(`settleAccount: a conta ${account.id} mudou de status no meio do acerto`);
    account.set('status', next);
}

/**
 * Acerta as contas que um pagamento afeta. Chamada na transação que criou, alterou,
 * excluiu ou confirmou o pagamento.
 *
 * - Pagamento com reserva: acerta **todas** as contas da reserva. O crédito da reserva é
 *   rateado entre elas (D-45), e o que um pagamento muda na conta A pode mudar o que
 *   sobra para a conta B.
 * - Pagamento só de conta (day-use, mesa, balcão): acerta a conta.
 *
 * Ordem de trava: reserva → contas em ordem de id, a mesma do check-out, do cancelamento
 * e do webhook (closeReservationAccounts). Dois pagamentos simultâneos acertam um depois
 * do outro, e o segundo já vê o primeiro.
 *
 * @param {import('sequelize').Model} payment
 * @param {import('sequelize').Transaction} transaction
 */
export async function settlePaymentAccount(payment, transaction) {
    const tenantId = payment.tenant_id;
    let accounts;
    if (payment.reservation_id) {
        // paranoid: false — reserva excluída ainda serializa quem mexe nas contas dela;
        // sem isso a trava não pegava linha nenhuma (🟡-1 da 3ª rodada).
        await ReservationModel.findOne({
            where: { id: payment.reservation_id, tenant_id: tenantId },
            attributes: ['id'],
            lock: transaction.LOCK.UPDATE,
            paranoid: false,
            transaction
        });
        accounts = await AccountModel.findAll({
            where: { reservation_id: payment.reservation_id, tenant_id: tenantId },
            order: [['id', 'ASC']],
            lock: transaction.LOCK.UPDATE,
            transaction
        });
    } else if (payment.account_id) {
        accounts = await AccountModel.findAll({
            where: { id: payment.account_id, tenant_id: tenantId },
            lock: transaction.LOCK.UPDATE,
            transaction
        });
    } else {
        return;
    }
    // Razão calculado uma vez: o acerto só troca CLOSED ↔ PAID, que não muda a ordem do
    // crédito (as duas são "fechadas") nem o total de nenhuma conta.
    const ledger = payment.reservation_id ? await reservationLedger(payment.reservation_id, tenantId, transaction) : undefined;
    for (const account of accounts) await settleAccount(account, transaction, ledger);
}

/**
 * Trava a conta pela ordem do projeto: reserva → conta (D-48). Lê a conta sem trava só
 * para saber a reserva dela, que nunca muda; trava a reserva; e relê a conta travada.
 *
 * @returns {Promise<import('sequelize').Model|null>} a conta travada, ou null
 */
export async function lockAccount(accountId, tenantId, transaction) {
    const found = await AccountModel.findOne({
        where: { id: accountId, tenant_id: tenantId }, attributes: ['id', 'reservation_id'], transaction
    });
    if (!found) return null;
    if (found.reservation_id) {
        // paranoid: false — a conta de reserva excluída continua recebendo pagamento, e a trava
        // precisa pegar a linha (🟡-1 da 3ª rodada).
        await ReservationModel.findOne({
            where: { id: found.reservation_id, tenant_id: tenantId },
            attributes: ['id'],
            lock: transaction.LOCK.UPDATE,
            paranoid: false,
            transaction
        });
    }
    return AccountModel.findOne({ where: { id: accountId, tenant_id: tenantId }, lock: transaction.LOCK.UPDATE, transaction });
}

/**
 * Bill de uma conta (CA-04.3.a): diária, consumos, total, pagamentos, saldo e itens.
 *
 * - `consumptions` soma só os itens faturáveis (CA-04.3.c), pela mesma função do GET da
 *   conta (`accountTotal`), para os dois nunca divergirem.
 * - Os itens vêm todos, inclusive cortesia, com `billable` e `reason` (CA-04.3.d).
 * - Conta INTERNAL: diária, consumos e total 0 (CA-04.3.f, RN-006). Os itens seguem com
 *   o valor gravado — o custo continua visível (D-24).
 * - `payments_made` soma os pagamentos PAID da conta e a parte dela no crédito da
 *   reserva (T-04.4, D-42 e D-45). Pode passar do total: o saldo fica negativo (D-44).
 * - `balance` é calculado aqui, a cada leitura, e nunca gravado (CA-04.3.b). A diária da
 *   conta fechada é gravada (D-39) — o saldo não.
 *
 * Valores em texto ('24.00'), como no resto de /accounts. Sem dado do hóspede (D-15).
 *
 * @param {import('sequelize').Model} account já validada no tenant
 * @param {import('sequelize').Transaction} [transaction] para ler o que a transação gravou
 */
export default async function accountBill(account, transaction) {
    // Em sequência, não Promise.all: dentro de uma transação as consultas dividem a mesma conexão.
    const items = await AccountItemModel.findAll({
        where: { account_id: account.id, tenant_id: account.tenant_id },
        attributes: ITEM_ATTRIBUTES,
        order: [['consumed_at', 'ASC'], ['created_at', 'ASC']],
        transaction
    });
    const { roomCharges, consumptions } = await accountCharges(account, transaction);
    // Total das partes já lidas: o GET roda sem transação, e outra leitura poderia ver um
    // item lançado no meio (🟢-2 da 3ª rodada).
    const totalCents = toCents(roomCharges) + toCents(consumptions);
    const { paidCents: paymentsCents } = await accountBalance(account, transaction);

    return {
        account_id: account.id,
        type: account.type,
        status: account.status,
        label: account.label,
        reservation_id: account.reservation_id,
        room_id: account.room_id,
        opened_at: account.opened_at,
        closed_at: account.closed_at,
        room_charges: roomCharges,
        consumptions,
        total: fromCents(totalCents),
        payments_made: fromCents(paymentsCents),
        balance: fromCents(totalCents - paymentsCents),
        items
    };
}
