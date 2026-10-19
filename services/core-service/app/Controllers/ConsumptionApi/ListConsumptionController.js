import ReservationModel from '../../Models/ReservationModel.js';
import itemAsConsumption, { reservationConsumptionItems } from '../../utils/itemAsConsumption.js';
import pendingLegacyConsumption from '../../utils/pendingLegacyConsumption.js';

/**
 * GET /reservations/:id/consumptions
 * Lista os consumos extras lançados na reserva — desde a T-04.2, os itens faturáveis
 * das contas da reserva, no formato antigo (CA-04.2.d).
 */
export default async function ListConsumptionController(request, response) {
    try {
        const tenantId = request.user.tenantId;
        const reservationId = request.params.id;

        const reservation = await ReservationModel.findOne({
            where: { id: reservationId, tenant_id: tenantId }
        });
        if (!reservation) return response.status(404).json({ error: 'Reserva não encontrada' });

        // Lista sem os consumos ainda não migrados seria incompleta (D-31).
        if (await pendingLegacyConsumption(reservationId)) {
            return response.status(503).json({ error: 'Consumos desta reserva em migração — lista temporariamente indisponível' });
        }

        const items = await reservationConsumptionItems(reservationId, tenantId);
        return response.status(200).json(items.map((item) => itemAsConsumption(item, reservationId)));
    } catch (error) {
        console.error('ListConsumptionController:', error.message);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
