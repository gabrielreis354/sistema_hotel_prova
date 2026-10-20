import sequelize from '../../database/connections/sequelize.js';
import AccountModel from '../Models/AccountModel.js';
import { accountCharges } from './accountCharges.js';
import { toCents } from './calculateStayTotal.js';

/**
 * Conta titular da reserva (T-04.4, D-42): a conta de diária mais antiga, sem as
 * excluídas. Entre as contas abertas, é a primeira a receber o crédito da reserva.
 * "Mais antiga" não muda com a troca de quarto. Mesmo desempate (opened_at, id) da sobra
 * de centavos da diária (lodgingShare).
 *
 * @param {Array<import('sequelize').Model>} accounts contas da reserva
 * @returns {import('sequelize').Model|null}
 */
function titularOf(accounts) {
    const lodging = accounts.filter((a) => a.charges_lodging);
    return byOpening(lodging)[0] ?? null;
}

const byOpening = (list) => [...list].sort((x, y) => (x.opened_at - y.opened_at) || (x.id < y.id ? -1 : 1));
const byClosing = (list) => [...list].sort((x, y) => (x.closed_at - y.closed_at) || (x.id < y.id ? -1 : 1));

/**
 * Ordem em que o crédito da reserva preenche as contas (D-45):
 *   1. as fechadas (CLOSED, PAID), na ordem em que fecharam;
 *   2. as abertas, com a titular primeiro e as outras pela abertura.
 *
 * Fechadas primeiro porque o total delas não muda mais (D-23, D-39): lançar item ou mudar
 * as datas da reserva só mexe nas abertas, que vêm depois — o que cabe a uma conta fechada
 * só muda com pagamento, e todo pagamento acerta as contas da reserva. Uma conta que fecha
 * entra no fim das fechadas: as que fecharam antes não perdem nada.
 */
function creditOrder(accounts) {
    const closed = byClosing(accounts.filter((a) => a.status !== 'OPEN'));
    const open = accounts.filter((a) => a.status === 'OPEN');
    const titular = titularOf(open);
    return [...closed, ...(titular ? [titular] : []), ...byOpening(open.filter((a) => a !== titular))];
}

/** Soma em NUMERIC no banco, devolvida como texto: somar dinheiro em float erra centavo. */
async function sumPaid(where, replacements, transaction) {
    const [[{ total }]] = await sequelize.query(`
        SELECT COALESCE(SUM(amount), 0)::text AS total
          FROM payments
         WHERE tenant_id = :tenantId AND status = 'PAID' AND deleted_at IS NULL AND ${where}`,
    { replacements, transaction });
    return toCents(total);
}

/**
 * Quanto do crédito da reserva cabe a cada conta (T-04.4, D-42 e D-45).
 *
 * Crédito da reserva = pagamentos PAID feitos na reserva sem conta (o sinal PIX, o
 * pagamento da recepção pela reserva). Ele preenche as contas na ordem de creditOrder,
 * cada uma até o que ela ainda deve depois dos pagamentos dela. A sobra — pagamento a
 * maior — fica na última conta da ordem, com saldo negativo (D-44).
 *
 * Sem isso, todo o crédito ia para a titular: pagar a reserva inteira deixava a titular
 * "devolvendo" e as outras contas devendo para sempre (🟡-1 do qa-redteam da T-04.4).
 *
 * @returns {Promise<Map<string, number>>} centavos por id de conta; vazio sem crédito ou sem conta
 */
async function reservationCredit(reservationId, tenantId, transaction) {
    let remaining = await sumPaid('account_id IS NULL AND reservation_id = :reservationId', { tenantId, reservationId }, transaction);
    const shares = new Map();
    if (remaining === 0) return shares;

    // Paranoid: conta excluída não recebe crédito.
    const accounts = await AccountModel.findAll({ where: { reservation_id: reservationId, tenant_id: tenantId }, transaction });
    const ordered = creditOrder(accounts);
    if (ordered.length === 0) return shares;

    const [direct] = await sequelize.query(`
        SELECT account_id, COALESCE(SUM(amount), 0)::text AS total
          FROM payments
         WHERE tenant_id = :tenantId AND reservation_id = :reservationId AND account_id IS NOT NULL
           AND status = 'PAID' AND deleted_at IS NULL
         GROUP BY account_id`,
    { replacements: { tenantId, reservationId }, transaction });
    const paidDirect = new Map(direct.map((row) => [row.account_id, toCents(row.total)]));

    // Em sequência: dentro de uma transação as consultas dividem a mesma conexão.
    for (const account of ordered) {
        const { totalCents } = await accountCharges(account, transaction);
        const owed = Math.max(0, totalCents - (paidDirect.get(account.id) ?? 0));
        const share = Math.min(owed, remaining);
        shares.set(account.id, share);
        remaining -= share;
    }
    const last = ordered.at(-1).id;
    shares.set(last, shares.get(last) + remaining);
    return shares;
}

/**
 * Quanto foi pago nesta conta, em centavos (CA-04.4.c): os pagamentos dela mais a parte
 * que lhe cabe do crédito da reserva. Só PAID conta — cobrança PIX PENDING, FAILED ou
 * EXPIRED ainda não pagou nada —, e pagamento excluído não conta.
 *
 * @param {import('sequelize').Model} account
 * @param {import('sequelize').Transaction} [transaction]
 * @returns {Promise<number>}
 */
export async function paymentsMadeCents(account, transaction) {
    const own = await sumPaid('account_id = :accountId', { tenantId: account.tenant_id, accountId: account.id }, transaction);
    if (!account.reservation_id) return own;
    const credit = await reservationCredit(account.reservation_id, account.tenant_id, transaction);
    return own + (credit.get(account.id) ?? 0);
}
