import { Op, UniqueConstraintError } from 'sequelize';
import AccountModel from '../Models/AccountModel.js';
import ReservationRoomModel from '../Models/ReservationRoomModel.js';
import RoomModel from '../Models/RoomModel.js';

/**
 * Rótulo da conta da suíte criada pelo sistema. Sem nome de hóspede: o garçom lista
 * contas (D-15). A migração (database/migrateConsumptions.js) monta o mesmo texto em SQL.
 */
export const roomAccountLabel = (roomNumber) => `Suíte ${roomNumber}`;

/**
 * Conta da suíte que cobra a diária do quarto principal da reserva — busca, ou cria.
 *
 * Usada pelas rotas antigas de consumo (T-04.2), que gravam em conta mas não conhecem
 * conta: o consumo é "da reserva". Se a recepção já abriu essa conta por /accounts, ela
 * é reaproveitada; senão nasce OPEN, ROOM, cobrando a diária (D-28).
 *
 * Troca de quarto (qa-redteam 19/10, 🟡-3): se a reserva mudou de quarto principal
 * depois do primeiro consumo, a conta que cobra a diária ainda aponta para o quarto
 * antigo — que saiu de reservation_rooms. Criar outra deixaria duas cobrando diária, e o
 * fechamento (T-04.3) cobraria duas vezes. A conta antiga passa a apontar para o quarto
 * atual (D-32). O UpdateReservationController não é tocado: a correção vive aqui.
 *
 * Não confere check-in de propósito: o contrato antigo lança em reserva de qualquer
 * status (exceção registrada à regra da T-04.1, D-28).
 *
 * Fora de transação: na corrida de duas criações, o índice da RN-005 recusa a segunda,
 * e o erro abortaria uma transação em volta. Uma conta aberta sem item é inofensiva.
 *
 * @param {import('sequelize').Model} reservation já validada no tenant
 * @returns {Promise<import('sequelize').Model>}
 */
export default async function reservationRoomAccount(reservation) {
    const where = {
        tenant_id: reservation.tenant_id,
        reservation_id: reservation.id,
        room_id: reservation.room_id,
        charges_lodging: true
    };

    const existing = await AccountModel.findOne({ where });
    if (existing) return existing;

    // paranoid: false — um quarto desativado depois não apaga o histórico da estadia.
    const roomOf = (id) => RoomModel.findOne({ where: { id, tenant_id: reservation.tenant_id }, paranoid: false });
    const room = await roomOf(reservation.room_id);

    try {
        const roomsOfStay = (await ReservationRoomModel.findAll({
            where: { reservation_id: reservation.id }, attributes: ['room_id']
        })).map((r) => r.room_id);

        const stale = await AccountModel.findOne({
            where: {
                tenant_id: reservation.tenant_id,
                reservation_id: reservation.id,
                type: 'ROOM',
                charges_lodging: true,
                room_id: { [Op.notIn]: roomsOfStay }
            }
        });
        if (stale) {
            // O rótulo só acompanha se for o que o sistema gerou; um escolhido pela
            // recepção fica como está.
            const oldRoom = await roomOf(stale.room_id);
            const changes = { room_id: reservation.room_id };
            if (oldRoom && stale.label === roomAccountLabel(oldRoom.number)) changes.label = roomAccountLabel(room.number);
            return await stale.update(changes);
        }

        return await AccountModel.create({
            ...where,
            type: 'ROOM',
            status: 'OPEN',
            guest_id: reservation.guest_id,
            label: roomAccountLabel(room.number)
        });
    } catch (error) {
        // Outra requisição criou no meio-tempo: usa a dela.
        if (error instanceof UniqueConstraintError && error.parent?.constraint === 'accounts_lodging_unique') {
            return AccountModel.findOne({ where });
        }
        throw error;
    }
}
