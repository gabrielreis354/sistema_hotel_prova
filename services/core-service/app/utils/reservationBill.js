import { reservationLedger } from './accountPayments.js';
import { reservationConsumptionItems } from './itemAsConsumption.js';
import { toCents } from './calculateStayTotal.js';

// Centavos com sinal: toCents não lê negativo, e um pagamento negativo anterior ao CHECK
// precisa entrar com o sinal (como no SUM_CENTS de accountPayments.js).
const amountCents = (value) => Math.round(Number(value) * 100);
const toNumber = (cents) => cents / 100;

/**
 * Bill da reserva a partir das contas dela (T-04.5, CA-04.5.a). Mesmo cálculo do bill de
 * cada conta (accountCharges, via reservationLedger): os dois não têm como divergir.
 *
 * - Diária: soma das diárias das contas, com a gravada no fechamento valendo sobre o
 *   total_amount atual (D-55, D-39). Se nenhuma conta cobra diária, a diária fica na
 *   reserva: total_amount, ou 0 se cancelada (D-54, D-46). É o caso da reserva antes do
 *   check-in, que até a T-04.6 não tem conta.
 * - Consumos: soma dos consumos das contas (só itens faturáveis, CA-04.3.c). A lista sai
 *   dos mesmos itens, no formato antigo.
 * - Pago e pendente: pagamentos da reserva (D-56). Com conta, o pago é igual à soma do que
 *   as contas receberam: o razão põe a sobra do crédito em alguma conta.
 *
 * Contrato idêntico ao de antes (CA-04.5.b): valores em número, não em texto.
 *
 * @param {import('sequelize').Model} reservation com `guest` e `payments` carregados
 * @param {import('sequelize').Transaction} transaction a mesma foto para todas as leituras (D-57)
 */
export default async function reservationBill(reservation, transaction) {
    const tenantId = reservation.tenant_id;
    // Em sequência: dentro de uma transação as consultas dividem a mesma conexão.
    const ledger = [...(await reservationLedger(reservation.id, tenantId, transaction)).values()];
    const consumptions = await reservationConsumptionItems(reservation.id, tenantId, transaction);

    const sum = (list, pick) => list.reduce((acc, item) => acc + pick(item), 0);

    const lodgingCovered = ledger.some((entry) => entry.chargesLodging);
    const uncoveredLodging = reservation.status === 'CANCELLED' ? 0 : toCents(reservation.total_amount);
    const roomCents = lodgingCovered ? sum(ledger, (e) => e.roomCents) : uncoveredLodging;
    const consumptionsCents = sum(ledger, (e) => e.consumptionsCents);
    const grandCents = roomCents + consumptionsCents;

    const payments = reservation.payments ?? [];
    const paidBy = (status) => sum(payments.filter((p) => p.status === status), (p) => amountCents(p.amount));
    const paidCents = paidBy('PAID');
    const balanceCents = grandCents - paidCents;

    return {
        reservation_id: reservation.id,
        status: reservation.status,
        guest: reservation.guest?.full_name ?? null,
        check_in_date: reservation.check_in_date,
        check_out_date: reservation.check_out_date,
        room_total: toNumber(roomCents),
        consumptions_total: toNumber(consumptionsCents),
        grand_total: toNumber(grandCents),
        total_paid: toNumber(paidCents),
        total_pending: toNumber(paidBy('PENDING')),
        balance_due: toNumber(balanceCents),
        fully_paid: balanceCents <= 0,
        consumptions: consumptions.map((c) => ({
            id: c.id, description: c.description, amount: Number(c.total), consumed_at: c.consumed_at
        })),
        payments: payments.map((p) => ({
            id: p.id, amount: Number(p.amount), method: p.method,
            kind: p.kind, status: p.status, paid_at: p.paid_at,
            // Estornado aparece marcado, com o motivo (CA-06.13.g) — e não soma em total_paid.
            void_reason: p.void_reason, voided_at: p.voided_at
        }))
    };
}
