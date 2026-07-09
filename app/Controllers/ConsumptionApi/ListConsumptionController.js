import ConsumptionModel from '../../Models/ConsumptionModel.js';
import ReservationModel from '../../Models/ReservationModel.js';

/**
 * GET /reservations/:id/consumptions
 * Lista os consumos extras lançados na reserva.
 */
export default async function ListConsumptionController(request, response) {
    try {
        const tenantId = request.user.tenantId;
        const reservationId = request.params.id;

        const reservation = await ReservationModel.findOne({
            where: { id: reservationId, tenant_id: tenantId }
        });
        if (!reservation) return response.status(404).json({ error: 'Reserva não encontrada' });

        const consumptions = await ConsumptionModel.findAll({
            where: { reservation_id: reservationId, tenant_id: tenantId },
            order: [['consumed_at', 'ASC']]
        });

        return response.status(200).json(consumptions);
    } catch (error) {
        console.error('ListConsumptionController:', error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
