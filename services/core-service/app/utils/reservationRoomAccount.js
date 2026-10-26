import { Op, UniqueConstraintError } from 'sequelize';
import sequelize from '../../database/connections/sequelize.js';
import AccountModel from '../Models/AccountModel.js';
import ReservationModel from '../Models/ReservationModel.js';
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
 * A criação trava a reserva numa transação curta (D-48): serializa com o check-in, que abre
 * a mesma conta (D-58). A busca sem trava e o realinhamento ficam fora dela. Se outro
 * caminho que não trava a reserva criar no meio-tempo, o índice da RN-005 recusa a segunda
 * e vale a que ficou.
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
        // Trava a reserva antes de criar, como o check-in (D-48, D-58). Sem a trava, o INSERT
        // daqui e o do check-in se esperavam (FK na reserva travada × índice da RN-005) e o
        // banco derrubava o consumo por deadlock (🟡-1 do qa-redteam da T-04.6). Com ela, quem
        // chega durante o check-in espera e encontra a conta que ele abriu.
        return await sequelize.transaction(async (transaction) => {
            await ReservationModel.findOne({
                where: { id: reservation.id, tenant_id: reservation.tenant_id },
                attributes: ['id'], lock: transaction.LOCK.UPDATE, paranoid: false, transaction
            });
            const opened = await AccountModel.findOne({ where, transaction });
            if (opened) return opened;
            return AccountModel.create({
                ...where,
                type: 'ROOM',
                status: 'OPEN',
                guest_id: reservation.guest_id,
                label: roomAccountLabel(room.number)
            }, { transaction });
        });
    } catch (error) {
        // Outra requisição criou no meio-tempo: usa a dela.
        if (isLodgingRace(error)) return AccountModel.findOne({ where });
        throw error;
    }
}

/**
 * Conta da suíte aberta pelo check-in (T-04.6, CA-04.6.a, D-58), dentro da transação do
 * check-in e depois da trava da reserva (D-48): se a conta falhar, o check-in inteiro volta
 * (CA-04.6.c).
 *
 * - Reaproveita qualquer conta de diária da reserva: a rota antiga de consumo pode ter
 *   criado uma antes do check-in (D-28). Não realinha conta de quarto antigo — o
 *   realinhamento roda em outra conexão (D-53), e a troca de quarto já leva a conta (D-51).
 * - Sem conta de diária, cria a do quarto principal, cobrando diária, com o hóspede da
 *   reserva e o rótulo do sistema, sem nome (D-15). Com uma conta só, ela leva a diária
 *   inteira, mesmo na reserva de vários quartos (D-40).
 * - A rota antiga também trava a reserva antes de criar (reservationRoomAccount): quem chega
 *   durante o check-in espera e encontra esta conta. O savepoint é defesa para um caminho
 *   que crie conta de diária sem travar a reserva: o índice da RN-005 recusa a segunda, e o
 *   check-in segue com a que ficou.
 *
 * @param {import('sequelize').Model} reservation travada pela transação
 * @param {import('sequelize').Model} room quarto principal da reserva
 * @param {import('sequelize').Transaction} transaction
 * @returns {Promise<import('sequelize').Model>}
 */
export async function openStayAccount(reservation, room, transaction) {
    const lodging = { tenant_id: reservation.tenant_id, reservation_id: reservation.id, charges_lodging: true };
    const existing = await AccountModel.findOne({ where: lodging, order: [['opened_at', 'ASC']], transaction });
    if (existing) return existing;

    try {
        // Savepoint: o erro do índice abortaria a transação do check-in inteira.
        return await sequelize.transaction({ transaction }, (savepoint) => AccountModel.create({
            ...lodging,
            room_id: reservation.room_id,
            type: 'ROOM',
            status: 'OPEN',
            guest_id: reservation.guest_id,
            label: roomAccountLabel(room.number)
        }, { transaction: savepoint }));
    } catch (error) {
        if (isLodgingRace(error)) return AccountModel.findOne({ where: lodging, transaction });
        throw error;
    }
}
