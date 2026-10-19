import AccountModel from '../Models/AccountModel.js';
import AccountItemModel from '../Models/AccountItemModel.js';
import ReservationModel from '../Models/ReservationModel.js';
import RoomModel from '../Models/RoomModel.js';
import RoomCategoryModel from '../Models/RoomCategoryModel.js';
import accountTotal from './accountTotal.js';
import { paymentsMadeCents, titularAccountId } from './accountPayments.js';
import pendingLegacyConsumption from './pendingLegacyConsumption.js';
import { toCents, fromCents } from './calculateStayTotal.js';

const ZERO = '0.00';

// Campos do item que o bill mostra. Sem created_by: quem lançou é dado interno da equipe.
const ITEM_ATTRIBUTES = [
    'id', 'product_id', 'description', 'quantity', 'unit_price', 'total', 'billable', 'reason', 'consumed_at'
];

/**
 * Parte da diária da reserva que cabe a esta conta.
 *
 * A reserva guarda um total só para todos os quartos (`total_amount`). Esse total é
 * dividido entre as **contas** da reserva que cobram diária (D-40), não entre os quartos:
 *   - com uma conta só, ela leva o total inteiro, mesmo numa reserva de vários quartos
 *     (a rota antiga e a migração da T-04.2 criam uma conta por reserva — 🔴-1 do qa-redteam);
 *   - a conta que ficou num quarto trocado continua cobrando: sem isso a diária da estadia
 *     não ficava em conta nenhuma (🟡-3). Duas contas depois de uma troca (N-1 da T-04.2)
 *     dividem o total, nunca o dobram.
 *
 * O peso de cada conta é o preço da categoria do quarto dela (D-33): o preço só define a
 * proporção, nunca o valor. A conta do quarto principal fica com a sobra dos centavos.
 *
 * Conta fechada guarda a diária que apresentou (D-39). As abertas dividem só o que sobra
 * do total depois das gravadas: a soma nunca passa do total, nem se o preço da categoria
 * ou o total da reserva mudarem depois. Se o total cair abaixo do já gravado, as abertas
 * ficam com 0 — o que foi apresentado não é desfeito.
 *
 * Diária zero quando a conta não é ROOM ou não cobra diária (CA-04.3.e, D-4), ou quando
 * a reserva foi cancelada ou excluída (D-35) — o consumo dela segue cobrado.
 *
 * @param {import('sequelize').Model} account
 * @param {import('sequelize').Transaction} [transaction]
 * @returns {Promise<string>} valor em texto, '0.00'
 */
export async function lodgingShare(account, transaction) {
    if (account.type !== 'ROOM' || !account.charges_lodging || !account.reservation_id) return ZERO;

    // Sem paranoid: false de propósito — reserva excluída não cobra diária.
    const reservation = await ReservationModel.findOne({
        where: { id: account.reservation_id, tenant_id: account.tenant_id },
        attributes: ['id', 'room_id', 'status', 'total_amount'],
        transaction
    });
    if (!reservation || reservation.status === 'CANCELLED') return ZERO;

    // Contas da estadia que cobram diária. Paranoid: conta excluída não disputa.
    const lodging = await AccountModel.findAll({
        where: { reservation_id: reservation.id, tenant_id: account.tenant_id, charges_lodging: true },
        attributes: ['id', 'room_id', 'status', 'closed_room_charges', 'opened_at'],
        transaction
    });
    const recorded = lodging.filter((a) => a.id !== account.id && a.status !== 'OPEN' && a.closed_room_charges !== null);
    const pending = [account, ...lodging.filter((a) => a.id !== account.id && !recorded.includes(a))];

    const recordedCents = recorded.reduce((sum, a) => sum + BigInt(toCents(a.closed_room_charges)), 0n);
    const totalCents = BigInt(toCents(reservation.total_amount));
    const remaining = totalCents > recordedCents ? totalCents - recordedCents : 0n;
    if (pending.length === 1) return fromCents(Number(remaining));

    // paranoid: false — quarto ou categoria desativados depois seguem pesando na estadia.
    const rooms = await RoomModel.findAll({
        where: { id: [...new Set(pending.map((a) => a.room_id))], tenant_id: account.tenant_id },
        attributes: ['id'],
        include: [{ model: RoomCategoryModel, as: 'category', attributes: ['price_per_night'], paranoid: false }],
        paranoid: false,
        transaction
    });
    const prices = new Map(rooms.map((room) => [room.id, BigInt(toCents(room.category?.price_per_night))]));
    // Sem preço em algum quarto (não deveria existir: a reserva recusa), divide por igual.
    const usable = pending.every((a) => (prices.get(a.room_id) ?? 0n) > 0n);
    const weightOf = (a) => (usable ? prices.get(a.room_id) : 1n);
    const weightSum = pending.reduce((sum, a) => sum + weightOf(a), 0n);

    // A sobra dos centavos vai para a conta do quarto principal; sem ela, para a mais antiga.
    const byAge = [...pending].sort((x, y) => (x.opened_at - y.opened_at) || (x.id < y.id ? -1 : 1));
    const anchor = pending.find((a) => a.room_id === reservation.room_id) ?? byAge[0];

    // BigInt: total em centavos × preço em centavos passa de 2^53 numa reserva grande.
    const shareOf = (a) => (remaining * weightOf(a)) / weightSum; // trunca
    if (account.id !== anchor.id) return fromCents(Number(shareOf(account)));

    const others = pending.filter((a) => a.id !== anchor.id).reduce((sum, a) => sum + shareOf(a), 0n);
    return fromCents(Number(remaining - others));
}

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
    const values = {
        status: 'CLOSED',
        closed_at: new Date(),
        closed_room_charges: account.type === 'INTERNAL' ? ZERO : await lodgingShare(account, transaction)
    };
    // Só conta aberta (N-4): regravar uma fechada mudaria o que foi apresentado (D-23, D-39).
    const [updated] = await AccountModel.update(values, {
        where: { id: account.id, tenant_id: account.tenant_id, status: 'OPEN' }, transaction
    });
    if (updated !== 1) throw new Error(`closeAccount: a conta ${account.id} não está aberta`);
    account.set(values);

    // Conta paga antes de fechar sai do fechamento já PAID (T-04.4, decisão 2).
    await settleAccount(account, transaction);
}

/**
 * Diária, consumos, total e pagamentos de uma conta — o que o bill mostra e o que o acerto
 * (settleAccount) compara. Um cálculo só para os dois nunca divergirem.
 *
 * @returns {Promise<{ roomCharges: string, consumptions: string, totalCents: number, paymentsCents: number }>}
 */
async function accountAmounts(account, transaction) {
    if (account.type === 'INTERNAL') return { roomCharges: ZERO, consumptions: ZERO, totalCents: 0, paymentsCents: 0 };

    const consumptions = await accountTotal(account.id, account.tenant_id, transaction);
    // Conta fechada mostra a diária que apresentou (D-39); só a fechada antes da T-04.3,
    // ainda sem o valor gravado pelo migrate, calcula na hora.
    const recorded = account.status !== 'OPEN' && account.closed_room_charges != null;
    const roomCharges = recorded ? account.closed_room_charges : await lodgingShare(account, transaction);

    // Centavos inteiros, como em calculateStayTotal: somar texto de dinheiro em float erra centavo.
    const totalCents = toCents(roomCharges) + toCents(consumptions);
    const paymentsCents = await paymentsMadeCents(account, transaction);
    return { roomCharges, consumptions, totalCents, paymentsCents };
}

/**
 * Acerta CLOSED ↔ PAID depois de um fechamento ou de um pagamento (T-04.4, decisão 2).
 *
 * PAID = conta fechada, com pagamento, e saldo ≤ 0 (pagamento a maior deixa o saldo
 * negativo: o hotel deve devolver — decisão 3). Se o saldo volta a ficar positivo
 * (pagamento excluído ou reduzido), volta a CLOSED.
 *
 * Não mexe em:
 *   - conta OPEN: ainda recebe item, e a de diária nem fecha durante a estadia (N-1);
 *     paga por inteiro, vira PAID quando fechar;
 *   - conta INTERNAL: nunca é receita (RN-006); accountAmounts devolve pagamento 0 para
 *     ela, então nunca chega a PAID;
 *   - conta fechada com total 0 e sem pagamento: não há o que pagar, continua CLOSED;
 *   - conta com consumo antigo ainda não migrado: o total sairia menor (D-31). O próximo
 *     pagamento, fechamento ou migrate acerta.
 *
 * @param {import('sequelize').Model} account travada pela transação de quem chama
 * @param {import('sequelize').Transaction} transaction
 */
export async function settleAccount(account, transaction) {
    if (!['CLOSED', 'PAID'].includes(account.status)) return;
    if (account.reservation_id && await pendingLegacyConsumption(account.reservation_id, transaction)) return;

    const { totalCents, paymentsCents } = await accountAmounts(account, transaction);
    const next = paymentsCents > 0 && totalCents - paymentsCents <= 0 ? 'PAID' : 'CLOSED';
    if (next === account.status) return;

    const [updated] = await AccountModel.update({ status: next }, {
        where: { id: account.id, tenant_id: account.tenant_id, status: account.status }, transaction
    });
    if (updated !== 1) throw new Error(`settleAccount: a conta ${account.id} mudou de status no meio do acerto`);
    account.set('status', next);
}

/**
 * Acerta a conta que um pagamento afeta: a dele ou, se foi feito na reserva sem conta, a
 * titular (decisão 1). Chamada na transação que criou, alterou, excluiu ou confirmou o
 * pagamento. Trava a conta: dois pagamentos simultâneos acertam um depois do outro, e o
 * segundo já vê o primeiro.
 *
 * @param {import('sequelize').Model} payment
 * @param {import('sequelize').Transaction} transaction
 */
export async function settlePaymentAccount(payment, transaction) {
    const accountId = payment.account_id
        ?? (payment.reservation_id ? await titularAccountId(payment.reservation_id, payment.tenant_id, transaction) : null);
    if (!accountId) return;

    const account = await AccountModel.findOne({
        where: { id: accountId, tenant_id: payment.tenant_id },
        lock: transaction.LOCK.UPDATE,
        transaction
    });
    if (account) await settleAccount(account, transaction);
}

/**
 * Bill de uma conta (CA-04.3.a): diária, consumos, total, pagamentos, saldo e itens.
 *
 * - `consumptions` soma só os itens faturáveis (CA-04.3.c), pela mesma função do GET da
 *   conta (`accountTotal`), para os dois nunca divergirem.
 * - Os itens vêm todos, inclusive cortesia, com `billable` e `reason` (CA-04.3.d).
 * - Conta INTERNAL: diária, consumos e total 0 (CA-04.3.f, RN-006). Os itens seguem com
 *   o valor gravado — o custo continua visível (D-24).
 * - `payments_made` soma os pagamentos PAID da conta e, na titular, os da reserva sem
 *   conta (T-04.4, decisão 1). Pode passar do total: o saldo fica negativo (decisão 3).
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
    const { roomCharges, consumptions, totalCents, paymentsCents } = await accountAmounts(account, transaction);

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
