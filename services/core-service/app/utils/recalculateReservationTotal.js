import ReservationRoomModel from '../Models/ReservationRoomModel.js';
import { calculateStayTotal } from './calculateStayTotal.js';

/**
 * Recalcula e grava o total de uma reserva a partir dos quartos que ela ocupa agora
 * (reservation_rooms) e das suas datas — a mesma regra da criação (CA-F.4.c).
 *
 * Reserva-bloco B2B não é recalculada: o preço dela é o do contrato assinado, não a soma das
 * diárias (SignContractController grava `total_amount: contract.total`).
 *
 * @returns {Promise<{ error?: { status: number, message: string } }>}
 */
export async function recalculateReservationTotal(reservation, tenantId, transaction) {
    if (reservation.source === 'B2B') return {};

    const rows = await ReservationRoomModel.findAll({
        where: { reservation_id: reservation.id },
        attributes: ['room_id'],
        transaction
    });
    const stay = await calculateStayTotal({
        roomIds: rows.map((r) => r.room_id),
        checkInDate: reservation.check_in_date,
        checkOutDate: reservation.check_out_date,
        tenantId,
        transaction
    });
    if (stay.error) return stay;

    reservation.total_amount = stay.total;
    await reservation.save({ transaction });
    return {};
}
