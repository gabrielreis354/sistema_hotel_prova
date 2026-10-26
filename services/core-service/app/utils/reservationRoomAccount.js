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
const isLodgingRace = (error) =>
    error instanceof UniqueConstraintError && error.parent?.constraint === 'accounts_lodging_unique';

// paranoid: false — um quarto desativado depois não apaga o histórico da estadia.
const roomOf = (id, tenantId) => RoomModel.findOne({ where: { id, tenant_id: tenantId }, paranoid: false });

/**
 * Realinha a conta que cobra diária num quarto que já não é da reserva (D-32).
 *
 * Depois de uma troca de quarto, essa conta aponta para o quarto antigo — que saiu de
 * reservation_rooms. Ela passa a apontar para o quarto principal atual, desde que ele
 * ainda não tenha conta cobrando diária. Chamada antes de qualquer criação de conta da
 * suíte, nas rotas antigas e no POST /accounts (reauditoria N-1): assim a criação
 * enxerga a conta realinhada e a RN-005 recusa a segunda diária.
 *
 * Realinha no máximo uma: o quarto principal só cabe uma. Desde 21/10 a troca e a remoção
 * de quarto já levam as contas (roomChangeAccounts.js, D-51); isto ficou como rede para dado legado.
 *
 * @returns {Promise<import('sequelize').Model|null>} a conta realinhada, ou null
 */
export async function realignStaleLodgingAccount(reservation) {
    const tenantId = reservation.tenant_id;
    const onMainRoom = await AccountModel.findOne({
        where: { tenant_id: tenantId, reservation_id: reservation.id, room_id: reservation.room_id, charges_lodging: true }
    });
    if (onMainRoom) return null;

    const roomsOfStay = (await ReservationRoomModel.findAll({
        where: { reservation_id: reservation.id }, attributes: ['room_id']
    })).map((r) => r.room_id);

    const stale = await AccountModel.findOne({
        where: {
            tenant_id: tenantId,
            reservation_id: reservation.id,
            type: 'ROOM',
            charges_lodging: true,
            // Conta fechada não muda mais (D-23, D-39): mover o quarto dela mudaria o que foi
            // apresentado, e por uma requisição que nem chegava a criar conta (🟡-1 da T-04.3).
            status: 'OPEN',
            room_id: { [Op.notIn]: roomsOfStay }
        }
    });
    if (!stale) return null;

    // O rótulo só acompanha se for o que o sistema gerou; um escolhido pela recepção
    // fica como está (reauditoria N-4: sobrescrever o que ela escreveu seria pior).
    const [oldRoom, room] = await Promise.all([roomOf(stale.room_id, tenantId), roomOf(reservation.room_id, tenantId)]);
    const changes = { room_id: reservation.room_id };
    if (oldRoom && room && stale.label === roomAccountLabel(oldRoom.number)) changes.label = roomAccountLabel(room.number);

    try {
        return await stale.update(changes);
    } catch (error) {
        // Outra requisição criou a conta do quarto atual no meio-tempo: a dela vale.
        if (isLodgingRace(error)) return null;
        throw error;
    }
}

export default async function reservationRoomAccount(reservation) {
    const where = {
        tenant_id: reservation.tenant_id,
        reservation_id: reservation.id,
        room_id: reservation.room_id,
        charges_lodging: true
    };

    const existing = await AccountModel.findOne({ where });
    if (existing) return existing;

    const realigned = await realignStaleLodgingAccount(reservation);
    if (realigned) return realigned;

    const room = await roomOf(reservation.room_id, reservation.tenant_id);
    try {
        return await AccountModel.create({
            ...where,
            type: 'ROOM',
            status: 'OPEN',
            guest_id: reservation.guest_id,
            label: roomAccountLabel(room.number)
        });
    } catch (error) {
        // Outra requisição criou no meio-tempo: usa a dela.
        if (isLodgingRace(error)) return AccountModel.findOne({ where });
        throw error;
    }
}
