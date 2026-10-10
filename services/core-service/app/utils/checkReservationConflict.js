import { Op } from 'sequelize';
import ReservationModel from '../Models/ReservationModel.js';
import ReservationRoomModel from '../Models/ReservationRoomModel.js';

/**
 * Verifica se o quarto está ocupado no período por OUTRA reserva — como quarto principal ou
 * como quarto extra. Consulta `reservation_rooms`, que guarda todos os quartos de toda reserva
 * (o principal entra pelo banco), com o período copiado da reserva (P-1, rodada 3). Antes,
 * só `reservations.room_id` era consultado e um quarto extra era vendido duas vezes.
 *
 * Sobreposição: checkIn_novo < checkOut_existente AND checkOut_novo > checkIn_existente.
 * Reservas CANCELLED ou CHECKED_OUT não bloqueiam (o EXCLUDE do banco ignora só CANCELLED —
 * divergência anterior a esta mudança, registrada no PR da etapa F).
 *
 * @param {string} roomId
 * @param {string} checkInDate        — YYYY-MM-DD
 * @param {string} checkOutDate       — YYYY-MM-DD
 * @param {string|null} excludeReservationId — ignora a própria reserva (alteração)
 * @param {string|null} tenantId      — isolamento multi-tenant
 * @param {object} [options]
 * @param {import('sequelize').Transaction} [options.transaction]
 * @returns {Promise<boolean>} true se há conflito
 */
export async function checkReservationConflict(roomId, checkInDate, checkOutDate, excludeReservationId = null, tenantId = null, { transaction } = {}) {
    const reservationWhere = { status: { [Op.notIn]: ['CANCELLED', 'CHECKED_OUT'] } };
    if (excludeReservationId) reservationWhere.id = { [Op.ne]: excludeReservationId };
    if (tenantId) reservationWhere.tenant_id = tenantId;

    const conflict = await ReservationRoomModel.findOne({
        where: {
            room_id: roomId,
            check_in_date:  { [Op.lt]: checkOutDate },
            check_out_date: { [Op.gt]: checkInDate }
        },
        include: [{ model: ReservationModel, as: 'reservation', required: true, attributes: ['id'], where: reservationWhere }],
        transaction
    });
    return conflict !== null;
}

/**
 * Quartos da lista que estão ocupados no período. Para validar TODOS os quartos de uma
 * reserva de uma vez — criação, alteração de datas, assinatura de contrato.
 */
export async function findConflictingRooms(roomIds, checkInDate, checkOutDate, excludeReservationId = null, tenantId = null, options = {}) {
    const conflicting = [];
    for (const roomId of roomIds) {
        if (await checkReservationConflict(roomId, checkInDate, checkOutDate, excludeReservationId, tenantId, options)) {
            conflicting.push(roomId);
        }
    }
    return conflicting;
}

/**
 * O banco recusou por sobreposição de quarto (EXCLUDE de `reservations` ou de
 * `reservation_rooms`). Acontece quando duas requisições passam juntas pela checagem da
 * aplicação — a corrida que só o banco fecha. Vira 409, nunca 500 (CA-F.1.c).
 */
export function isRoomOccupiedError(error) {
    return error?.name === 'SequelizeExclusionConstraintError';
}

export const ROOM_OCCUPIED_MESSAGE = 'Quarto indisponível no período solicitado';
