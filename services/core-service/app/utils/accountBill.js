import AccountItemModel from '../Models/AccountItemModel.js';
import ReservationModel from '../Models/ReservationModel.js';
import ReservationRoomModel from '../Models/ReservationRoomModel.js';
import RoomModel from '../Models/RoomModel.js';
import RoomCategoryModel from '../Models/RoomCategoryModel.js';
import accountTotal from './accountTotal.js';
import { toCents, fromCents } from './calculateStayTotal.js';

const ZERO = '0.00';

// Campos do item que o bill mostra. Sem created_by: quem lançou é dado interno da equipe.
const ITEM_ATTRIBUTES = [
    'id', 'product_id', 'description', 'quantity', 'unit_price', 'total', 'billable', 'reason', 'consumed_at'
];

/**
 * Parte da diária da reserva que cabe a esta conta (D-33).
 *
 * A reserva guarda um total só para todos os quartos (`total_amount`). Esse total é
 * rateado entre os quartos na proporção do preço da categoria de cada um, e o quarto
 * principal fica com a sobra dos centavos. Assim a soma das contas é sempre o total da
 * reserva, inclusive na reserva-bloco B2B (cujo total é o do contrato, não preço ×
 * noites) e quando o preço da categoria muda depois da reserva: o preço atual só pesa
 * a divisão, nunca define o valor.
 *
 * Diária zero quando:
 *   - a conta não é ROOM ou não cobra diária (CA-04.3.e, D-4);
 *   - a reserva foi cancelada ou excluída (D-35) — o consumo dela segue cobrado;
 *   - o quarto da conta saiu da reserva (D-32): a conta do quarto atual é quem cobra.
 *
 * @returns {Promise<string>} valor em texto, '0.00'
 */
async function lodgingShare(account, transaction) {
    if (account.type !== 'ROOM' || !account.charges_lodging || !account.reservation_id) return ZERO;

    // Sem paranoid: false de propósito — reserva excluída não cobra diária.
    const reservation = await ReservationModel.findOne({
        where: { id: account.reservation_id, tenant_id: account.tenant_id },
        attributes: ['id', 'room_id', 'status', 'total_amount'],
        transaction
    });
    if (!reservation || reservation.status === 'CANCELLED') return ZERO;

    const pivot = await ReservationRoomModel.findAll({
        where: { reservation_id: reservation.id },
        attributes: ['room_id'],
        transaction
    });
    const roomIds = [...new Set(pivot.map((row) => row.room_id))];
    if (!roomIds.includes(account.room_id)) return ZERO;

    const totalCents = BigInt(toCents(reservation.total_amount));
    if (roomIds.length === 1) return fromCents(Number(totalCents));

    // paranoid: false — quarto ou categoria desativados depois seguem pesando na estadia.
    const rooms = await RoomModel.findAll({
        where: { id: roomIds, tenant_id: account.tenant_id },
        attributes: ['id'],
        include: [{ model: RoomCategoryModel, as: 'category', attributes: ['price_per_night'], paranoid: false }],
        paranoid: false,
        transaction
    });
    const weights = new Map(rooms.map((room) => [room.id, BigInt(toCents(room.category?.price_per_night))]));
    // Sem preço em algum quarto (não deveria existir: a reserva recusa), divide por igual.
    const usable = roomIds.every((id) => (weights.get(id) ?? 0n) > 0n);
    const weightOf = (id) => (usable ? weights.get(id) : 1n);
    const weightSum = roomIds.reduce((sum, id) => sum + weightOf(id), 0n);

    // BigInt: total em centavos × preço em centavos passa de 2^53 numa reserva grande.
    const shareOf = (id) => (totalCents * weightOf(id)) / weightSum; // trunca
    if (account.room_id !== reservation.room_id) return fromCents(Number(shareOf(account.room_id)));

    const others = roomIds
        .filter((id) => id !== reservation.room_id)
        .reduce((sum, id) => sum + shareOf(id), 0n);
    return fromCents(Number(totalCents - others));
}

/**
 * Bill de uma conta (CA-04.3.a): diária, consumos, total, pagamentos, saldo e itens.
 *
 * - `consumptions` soma só os itens faturáveis (CA-04.3.c), pela mesma função do GET da
 *   conta (`accountTotal`), para os dois nunca divergirem.
 * - Os itens vêm todos, inclusive cortesia, com `billable` e `reason` (CA-04.3.d).
 * - Conta INTERNAL: diária, consumos e total 0 (CA-04.3.f, RN-006). Os itens seguem com
 *   o valor gravado — o custo continua visível (D-24).
 * - `payments_made` é 0 até a T-04.4, que liga pagamento a conta (D-34).
 * - `balance` é calculado aqui, a cada leitura, e nunca gravado (CA-04.3.b).
 *
 * Valores em texto ('24.00'), como no resto de /accounts. Sem dado do hóspede (D-15).
 *
 * @param {import('sequelize').Model} account já validada no tenant
 * @param {import('sequelize').Transaction} [transaction] para ler o que a transação gravou
 */
export default async function accountBill(account, transaction) {
    const internal = account.type === 'INTERNAL';

    // Em sequência, não Promise.all: dentro de uma transação as consultas dividem a mesma conexão.
    const items = await AccountItemModel.findAll({
        where: { account_id: account.id, tenant_id: account.tenant_id },
        attributes: ITEM_ATTRIBUTES,
        order: [['consumed_at', 'ASC'], ['created_at', 'ASC']],
        transaction
    });
    const consumptions = internal ? ZERO : await accountTotal(account.id, account.tenant_id, transaction);
    const roomCharges = internal ? ZERO : await lodgingShare(account, transaction);

    // Centavos inteiros, como em calculateStayTotal: somar texto de dinheiro em float erra centavo.
    const totalCents = toCents(roomCharges) + toCents(consumptions);
    const paymentsCents = 0;

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
