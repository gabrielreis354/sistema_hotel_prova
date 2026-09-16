import ConsumptionModel from '../../Models/ConsumptionModel.js';
import ReservationModel from '../../Models/ReservationModel.js';

/**
 * POST /reservations/:id/consumptions
 * Lança um consumo extra (frigobar, restaurante, spa) na reserva.
 */
export default async function CreateConsumptionController(request, response) {
    try {
        const tenantId = request.user.tenantId;
        const reservationId = request.params.id;
        const { description, amount, consumed_at } = request.body;

        const errors = [];
        if (!description || String(description).trim() === '') errors.push('description obrigatório');
        if (amount === undefined || Number(amount) <= 0)       errors.push('amount deve ser maior que zero');
        if (errors.length) return response.status(400).json({ errors });

        // Isolamento: a reserva precisa pertencer ao tenant do usuário.
        const reservation = await ReservationModel.findOne({
            where: { id: reservationId, tenant_id: tenantId }
        });
        if (!reservation) return response.status(404).json({ error: 'Reserva não encontrada' });

        const consumption = await ConsumptionModel.create({
            tenant_id: tenantId,
            reservation_id: reservationId,
            description: String(description).trim(),
            amount,
            consumed_at: consumed_at ?? new Date()
        });

        return response.status(201).json(consumption);
    } catch (error) {
        console.error('CreateConsumptionController:', error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
