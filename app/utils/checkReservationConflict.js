import { Op } from 'sequelize';
import ReservationModel from '../Models/ReservationModel.js';

/**
 * Verifica se existe conflito de reserva para um quarto no período informado.
 *
 * Lógica: há conflito quando a nova reserva se sobrepõe a uma já existente.
 * Sobreposição: checkIn_novo < checkOut_existente AND checkOut_novo > checkIn_existente
 *
 * Reservas com status CANCELLED ou CHECKED_OUT não bloqueiam novas reservas.
 *
 * @param {string} roomId
 * @param {string} checkInDate  — formato YYYY-MM-DD
 * @param {string} checkOutDate — formato YYYY-MM-DD
 * @param {string|null} excludeReservationId — ignorar reserva específica (útil no update)
 * @returns {Promise<boolean>} true se há conflito
 */
export async function checkReservationConflict(roomId, checkInDate, checkOutDate, excludeReservationId = null) {
    const where = {
        room_id: roomId,
        status: { [Op.notIn]: ['CANCELLED', 'CHECKED_OUT'] },
        check_in_date:  { [Op.lt]: checkOutDate },
        check_out_date: { [Op.gt]: checkInDate }
    };

    if (excludeReservationId) {
        where.id = { [Op.ne]: excludeReservationId };
    }

    const conflict = await ReservationModel.findOne({ where });
    return conflict !== null;
}
