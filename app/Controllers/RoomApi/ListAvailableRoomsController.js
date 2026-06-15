import RoomModel from '../../Models/RoomModel.js';
import RoomCategoryModel from '../../Models/RoomCategoryModel.js';
import { checkReservationConflict } from '../../utils/checkReservationConflict.js';

export default async function ListAvailableRoomsController(request, response) {
    try {
        const tenantId = request.user.tenantId;
        const { check_in, check_out } = request.query;

        if (!check_in || !check_out) {
            return response.status(400).json({ error: 'check_in e check_out são obrigatórios (formato: YYYY-MM-DD)' });
        }

        if (check_in >= check_out) {
            return response.status(400).json({ error: 'check_in deve ser anterior ao check_out' });
        }

        // Busca apenas quartos com status AVAILABLE — OCCUPIED, CLEANING e MAINTENANCE são descartados aqui
        const rooms = await RoomModel.findAll({
            where: { tenant_id: tenantId, status: 'AVAILABLE' },
            include: [{ model: RoomCategoryModel, as: 'category', attributes: ['id', 'name', 'price_per_night'] }]
        });

        // Filtra os quartos que não têm conflito de reserva no período (DRY: reutiliza checkReservationConflict)
        const availabilityChecks = await Promise.all(
            rooms.map(async (room) => {
                const hasConflict = await checkReservationConflict(room.id, check_in, check_out, null, tenantId);
                return hasConflict ? null : room;
            })
        );

        const availableRooms = availabilityChecks.filter(Boolean);

        return response.json(availableRooms);
    } catch (error) {
        console.error(error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
