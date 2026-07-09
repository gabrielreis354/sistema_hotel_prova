import ConsumptionModel from '../../Models/ConsumptionModel.js';

/**
 * DELETE /reservations/:id/consumptions/:consumptionId
 * Remove (soft delete) um consumo extra da reserva.
 */
export default async function DeleteConsumptionController(request, response) {
    try {
        const tenantId = request.user.tenantId;
        const { id: reservationId, consumptionId } = request.params;

        const consumption = await ConsumptionModel.findOne({
            where: { id: consumptionId, reservation_id: reservationId, tenant_id: tenantId }
        });
        if (!consumption) return response.status(404).json({ error: 'Consumo não encontrado' });

        await consumption.destroy(); // soft delete (paranoid)
        return response.status(204).send();
    } catch (error) {
        console.error('DeleteConsumptionController:', error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
