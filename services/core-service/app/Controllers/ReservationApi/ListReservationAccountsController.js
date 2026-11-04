import ReservationModel from '../../Models/ReservationModel.js';
import AccountModel from '../../Models/AccountModel.js';
import isUuid from '../../utils/isUuid.js';

/**
 * GET /reservations/:id/accounts
 * Contas da reserva (T-04.6, CA-04.6.d, D-60), no formato de GET /accounts: a recepção vê
 * a conta da suíte aberta pelo check-in e as dos acompanhantes. Fechadas e pagas entram;
 * excluídas não (paranoid). Da mais antiga para a mais nova.
 *
 * O garçom não chega aqui: a allowlist de app/utils/roles.js não libera /reservations.
 */
export default async function ListReservationAccountsController(request, response) {
    try {
        const { id } = request.params;
        const tenantId = request.user.tenantId;

        // :id não-UUID chega ao Postgres como cast inválido e viraria 500.
        if (!isUuid(id)) return response.status(404).json({ error: 'Reserva não encontrada' });

        const reservation = await ReservationModel.findOne({ where: { id, tenant_id: tenantId }, attributes: ['id'] });
        if (!reservation) return response.status(404).json({ error: 'Reserva não encontrada' });

        const accounts = await AccountModel.findAll({
            where: { reservation_id: reservation.id, tenant_id: tenantId },
            order: [['opened_at', 'ASC'], ['id', 'ASC']]
        });
        return response.json(accounts);
    } catch (error) {
        console.error('ListReservationAccountsController:', error.message);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
