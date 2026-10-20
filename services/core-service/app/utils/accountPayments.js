import sequelize from '../../database/connections/sequelize.js';
import AccountModel from '../Models/AccountModel.js';
import { accountCharges } from './accountCharges.js';

const byOpening = (list) => [...list].sort((x, y) => (x.opened_at - y.opened_at) || (x.id < y.id ? -1 : 1));
const byClosing = (list) => [...list].sort((x, y) => (x.closed_at - y.closed_at) || (x.id < y.id ? -1 : 1));

/**
 * Ordem em que o crédito da reserva preenche as contas (D-45):
 *   1. as fechadas (CLOSED, PAID), na ordem em que fecharam;
 *   2. as abertas, com a titular primeiro — a conta de diária mais antiga (D-42) — e as
 *      outras pela abertura.
 *
 * Fechadas primeiro porque o total delas não muda mais (D-23, D-39): lançar item ou mudar
 * as datas da reserva só mexe nas abertas, que vêm depois — o que cabe a uma conta fechada
 * só muda com pagamento, e todo pagamento acerta as contas da reserva. Uma conta que fecha
 * entra no fim das fechadas: as que fecharam antes não perdem nada.
 */
function creditOrder(accounts) {
    const closed = byClosing(accounts.filter((a) => a.status !== 'OPEN'));
    const open = accounts.filter((a) => a.status === 'OPEN');
    const titular = byOpening(open.filter((a) => a.charges_lodging))[0];
    return [...closed, ...(titular ? [titular] : []), ...byOpening(open.filter((a) => a !== titular))];
}

/**
 * Soma em centavos, com sinal, feita no banco em NUMERIC: somar dinheiro em float erra
 * centavo, e toCents não lê negativo — um pagamento negativo anterior ao CHECK precisa
 * entrar com o sinal (🟢-4 da reauditoria).
 */
const SUM_CENTS = `(COALESCE(SUM(amount), 0) * 100)::bigint::text`;

/**
 * Total e pago de cada conta de uma reserva (T-04.4) — o "razão" que o bill, o acerto e o
 * rateio leem. Calculado uma vez por acerto, não uma vez por conta (🟢-3 da reauditoria).
 *
 * Pago = pagamentos PAID da conta + a parte do crédito da reserva que lhe cabe. Crédito da
 * reserva = pagamentos PAID feitos na reserva sem conta (o sinal PIX, o pagamento da
 * recepção pela reserva). Ele preenche as contas na ordem de creditOrder, cada uma até o
 * que ela ainda deve (D-45).
 *
 * A sobra — pagamento a maior — fica na **primeira** conta da ordem com total > 0 (sem
 * nenhuma, na primeira). A primeira é estável: conta nova entra depois dela. Na última, a
 * sobra pulava para cada conta aberta depois e deixava PAID uma conta de total 0 que já não
 * tinha pagamento nenhum (🟢-1 da reauditoria).
 *
 * Só PAID conta — cobrança PIX PENDING, FAILED ou EXPIRED ainda não pagou nada —, e
 * pagamento ou conta excluídos não contam.
 *
 * @returns {Promise<Map<string, { totalCents: number, paidCents: number }>>}
 */
export async function reservationLedger(reservationId, tenantId, transaction) {
    const accounts = await AccountModel.findAll({ where: { reservation_id: reservationId, tenant_id: tenantId }, transaction });

    const [rows] = await sequelize.query(`
        SELECT account_id, ${SUM_CENTS} AS cents
          FROM payments
         WHERE tenant_id = :tenantId AND reservation_id = :reservationId
           AND status = 'PAID' AND deleted_at IS NULL
         GROUP BY account_id`,
    { replacements: { tenantId, reservationId }, transaction });
    const paid = new Map(rows.map((row) => [row.account_id, Number(row.cents)])); // chave null = crédito
    let remaining = paid.get(null) ?? 0;

    const ledger = new Map();
    const ordered = creditOrder(accounts);
    // Em sequência: dentro de uma transação as consultas dividem a mesma conexão.
    for (const account of ordered) {
        const { totalCents } = await accountCharges(account, transaction);
        const direct = paid.get(account.id) ?? 0;
        const share = Math.max(0, Math.min(totalCents - direct, remaining));
        remaining -= share;
        ledger.set(account.id, { totalCents, paidCents: direct + share });
    }
    if (remaining !== 0 && ordered.length > 0) {
        const target = ordered.find((a) => ledger.get(a.id).totalCents > 0) ?? ordered[0];
        ledger.get(target.id).paidCents += remaining;
    }
    return ledger;
}

/**
 * Total e pago de uma conta, em centavos (CA-04.4.c). Conta de reserva lê o razão da
 * reserva (ou o que o chamador já calculou); conta sem reserva soma só os pagamentos dela.
 *
 * @param {import('sequelize').Model} account
 * @param {import('sequelize').Transaction} [transaction]
 * @param {Map} [ledger] razão da reserva já calculado na mesma transação
 * @returns {Promise<{ totalCents: number, paidCents: number }>}
 */
export async function accountBalance(account, transaction, ledger) {
    if (account.reservation_id) {
        const book = ledger ?? await reservationLedger(account.reservation_id, account.tenant_id, transaction);
        const entry = book.get(account.id);
        if (entry) return entry;
    }
    const { totalCents } = await accountCharges(account, transaction);
    const [[{ cents }]] = await sequelize.query(`
        SELECT ${SUM_CENTS} AS cents FROM payments
         WHERE tenant_id = :tenantId AND account_id = :accountId AND status = 'PAID' AND deleted_at IS NULL`,
    { replacements: { tenantId: account.tenant_id, accountId: account.id }, transaction });
    return { totalCents, paidCents: Number(cents) };
}
