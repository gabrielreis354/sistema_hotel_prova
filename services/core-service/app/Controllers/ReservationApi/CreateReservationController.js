import ReservationModel from '../../Models/ReservationModel.js';
import ReservationRoomModel from '../../Models/ReservationRoomModel.js';
import RoomModel from '../../Models/RoomModel.js';
import RoomCategoryModel from '../../Models/RoomCategoryModel.js';
import GuestModel from '../../Models/GuestModel.js';
import sequelize from '../../../database/connections/sequelize.js';
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

        // Valida a FK do hóspede antes de qualquer escrita: um guest_id inexistente
        // estouraria a foreign key dentro da transação e retornaria 500 genérico.
        const guest = await GuestModel.findOne({ where: { id: guest_id, tenant_id: tenantId } });
        if (!guest) return response.status(404).json({ error: 'Hóspede não encontrado' });

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

        // Validar todos os quartos extras ANTES de iniciar qualquer escrita no banco.
        // Se a validação ocorresse dentro do loop de criação, uma falha no segundo ou terceiro ID
        // deixaria a reserva e as pivot rows anteriores órfãs no banco.
        if (Array.isArray(extra_room_ids)) {
            for (const rid of extra_room_ids) {
                const extraRoom = await RoomModel.findOne({ where: { id: rid, tenant_id: tenantId } });
                if (!extraRoom) {
                    return response.status(404).json({ error: `Quarto extra não encontrado: ${rid}` });
                }
            }
        }

        const checkIn  = new Date(check_in_date);
        const checkOut = new Date(check_out_date);
        const nights = Math.ceil((checkOut - checkIn) / (1000 * 60 * 60 * 24));
        const total_amount = parseFloat(room.category.price_per_night) * nights;

        // Transação: reserva + pivot rows são atômicas — ou tudo persiste, ou nada persiste.
        const transaction = await sequelize.transaction();
        try {
            const reservation = await ReservationModel.create({
                tenant_id: tenantId,
                guest_id,
                room_id,
                user_id: userId,
                check_in_date,
                check_out_date,
                status: 'PENDING',
                total_amount
            }, { transaction });

            // Vincular quarto principal na tabela pivô (N:N)
            await ReservationRoomModel.create({ reservation_id: reservation.id, room_id }, { transaction });

            // Vincular quartos adicionais (todos já validados acima)
            if (Array.isArray(extra_room_ids)) {
                for (const rid of extra_room_ids) {
                    await ReservationRoomModel.create({ reservation_id: reservation.id, room_id: rid }, { transaction });
                }
            }

            await transaction.commit();
            return response.status(201).json(reservation);
        } catch (txError) {
            await transaction.rollback();
            throw txError;
        }
    } catch (error) {
        console.error(error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
