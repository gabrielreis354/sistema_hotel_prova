import { Transaction } from 'sequelize';
import sequelize from '../../../database/connections/sequelize.js';
import ReservationModel from '../../Models/ReservationModel.js';
import GuestModel from '../../Models/GuestModel.js';
import PaymentModel from '../../Models/PaymentModel.js';
import reservationBill from '../../utils/reservationBill.js';
import pendingLegacyConsumption from '../../utils/pendingLegacyConsumption.js';

/**
 * GET /reservations/:id/bill
 * Fechamento de conta: (diária + consumos extras) − pagamentos confirmados = saldo.
 *
 * Desde a T-04.5 os totais são a soma das contas da reserva (app/utils/reservationBill.js).
 * O contrato de resposta é o mesmo (tests/bill-consumptions.test.js é o guardião).
 *
 * Considera PAGO apenas o que tem status PAID (um sinal PIX PENDING ainda não quita; um
 * pagamento estornado, VOIDED, segue listado como histórico — T-06.13).
 *
 * Leitura numa transação REPEATABLE READ só de leitura (D-57): reserva, contas, itens e
 * pagamentos saem da mesma foto, sem travar nada — a ordem de trava reserva → contas
 * (D-48, D-53) não é tocada.
 */
export default async function GetBillController(request, response) {
    try {
        const { id } = request.params;
        const tenantId = request.user.tenantId;

        const result = await sequelize.transaction(
            { isolationLevel: Transaction.ISOLATION_LEVELS.REPEATABLE_READ, readOnly: true },
            async (transaction) => {
                const reservation = await ReservationModel.findOne({
                    where: { id, tenant_id: tenantId },
                    include: [
                        { model: GuestModel,   as: 'guest',    attributes: ['id', 'full_name'] },
                        // Sem attributes viriam pix_qr_code, provider e provider_charge_id — que a
                        // conta não usa e o `payments.map()` não devolve. Carregar só o necessário
                        // evita que um `payments` devolvido inteiro no futuro vaze o QR.
                        { model: PaymentModel, as: 'payments', attributes: ['id', 'amount', 'method', 'kind', 'status', 'paid_at', 'void_reason', 'voided_at'] }
                    ],
                    transaction
                });
                if (!reservation) return { status: 404, body: { error: 'Reserva não encontrada' } };

                // Consumo antigo ainda não migrado: o total sairia menor. Recusar, nunca mentir (D-31).
                if (await pendingLegacyConsumption(reservation.id, transaction)) {
                    return { status: 503, body: { error: 'Consumos desta reserva em migração — conta temporariamente indisponível' } };
                }

                return { status: 200, body: await reservationBill(reservation, transaction) };
            }
        );
        return response.status(result.status).json(result.body);
    } catch (error) {
        console.error('GetBillController:', error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
