import ReservationModel from '../../Models/ReservationModel.js';
import ReservationRoomModel from '../../Models/ReservationRoomModel.js';
import RoomModel from '../../Models/RoomModel.js';
import RoomCategoryModel from '../../Models/RoomCategoryModel.js';
import { checkReservationConflict } from '../../utils/checkReservationConflict.js';

export default async function CreateReservationController(request, response) {
    try {
        const tenantId = request.user.tenantId;
        const userId = request.user.userId;
        const { guest_id, room_id, check_in_date, check_out_date, extra_room_ids } = request.body;

        const errors = [];
        if (!guest_id)       errors.push('guest_id obrigatório');
        if (!room_id)        errors.push('room_id obrigatório');
        if (!check_in_date)  errors.push('check_in_date obrigatório');
        if (!check_out_date) errors.push('check_out_date obrigatório');
        if (errors.length) return response.status(400).json({ errors });

        const hasConflict = await checkReservationConflict(room_id, check_in_date, check_out_date, null, tenantId);
        if (hasConflict) {
            return response.status(409).json({ error: 'Quarto indisponível no período solicitado' });
        }

        const room = await RoomModel.findOne({
            where: { id: room_id, tenant_id: tenantId },
            include: [{ model: RoomCategoryModel, as: 'category' }]
        });
        if (!room) return response.status(404).json({ error: 'Quarto não encontrado' });

        if (!room.category?.price_per_night) {
            return response.status(422).json({ error: 'Categoria do quarto não possui preço definido' });
        }

        const checkIn  = new Date(check_in_date);
        const checkOut = new Date(check_out_date);
        const nights = Math.ceil((checkOut - checkIn) / (1000 * 60 * 60 * 24));
        const total_amount = parseFloat(room.category.price_per_night) * nights;

        const reservation = await ReservationModel.create({
            tenant_id: tenantId,
            guest_id,
            room_id,
            user_id: userId,
            check_in_date,
            check_out_date,
            status: 'PENDING',
            total_amount
        });

        // Vincular quarto principal na tabela pivô (N:N)
        await ReservationRoomModel.create({ reservation_id: reservation.id, room_id });

        // Vincular quartos adicionais, se informados
        if (Array.isArray(extra_room_ids)) {
            for (const rid of extra_room_ids) {
                await ReservationRoomModel.create({ reservation_id: reservation.id, room_id: rid });
            }
        }

        return response.status(201).json(reservation);
    } catch (error) {
        console.error(error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
