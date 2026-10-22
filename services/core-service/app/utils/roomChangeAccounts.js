import AccountModel from '../Models/AccountModel.js';
import RoomModel from '../Models/RoomModel.js';
import { roomAccountLabel } from './reservationRoomAccount.js';

// Contas da estadia num quarto que sai da reserva (repasse do qa-redteam de 19/10).
// A conta ROOM pertence ao quarto DA ESTADIA (D-5), e cada quarto da estadia tem no máximo
// uma conta cobrando diária (RN-005 / D-3). Quem troca ou remove o quarto leva as contas
// dele, na mesma transação, para um quarto que continua na estadia — antes, a conta ficava
// apontando para um quarto que o hóspede deixou.
//
// Nenhuma conta é apagada e nenhum lançamento muda: a conta muda de quarto com tudo que
// tem dentro (itens, pagamentos). Só conta ABERTA muda: a fechada ou paga já foi
// apresentada e não muda mais (D-23, D-39).
//
// Ordem de trava do projeto (D-48): quem chama já travou a reserva; aqui travam as contas,
// em ordem de id.

const openAccountsOfRoom = (reservation, roomId, transaction) => AccountModel.findAll({
    where: {
        tenant_id: reservation.tenant_id,
        reservation_id: reservation.id,
        room_id: roomId,
        type: 'ROOM',
        status: 'OPEN'
    },
    order: [['id', 'ASC']],
    lock: transaction.LOCK.UPDATE,
    transaction
});

// Contas de diária desta estadia no quarto. Sem filtro de status, como o índice
// accounts_lodging_unique: conta fechada também ocupa a vaga.
const lodgingAccountsOfRoom = (reservation, roomId, transaction) => AccountModel.findAll({
    where: { tenant_id: reservation.tenant_id, reservation_id: reservation.id, room_id: roomId, charges_lodging: true },
    attributes: ['id'],
    order: [['id', 'ASC']],
    transaction
});

// paranoid: false — um quarto desativado depois não apaga o histórico da estadia.
const roomOf = (id, tenantId, transaction) =>
    RoomModel.findOne({ where: { id, tenant_id: tenantId }, attributes: ['id', 'number'], paranoid: false, transaction });

/**
 * Passa as contas para o quarto de destino. O rótulo só acompanha se for o que o sistema
 * gerou ("Suíte 906"); o escolhido pela recepção fica como está (D-32, reauditoria N-4).
 * Com `dropLodging`, a conta deixa de cobrar diária: o destino já tem a conta de diária.
 */
async function relocate(accounts, reservation, fromRoomId, toRoomId, transaction, { dropLodging = false } = {}) {
    // Em sequência, não Promise.all: dentro da transação as consultas dividem a conexão.
    const oldRoom = await roomOf(fromRoomId, reservation.tenant_id, transaction);
    const newRoom = await roomOf(toRoomId, reservation.tenant_id, transaction);
    const systemLabel = oldRoom ? roomAccountLabel(oldRoom.number) : null;

    for (const account of accounts) {
        const changes = { room_id: toRoomId };
        if (newRoom && account.label === systemLabel) changes.label = roomAccountLabel(newRoom.number);
        if (dropLodging && account.charges_lodging) changes.charges_lodging = false;
        await account.update(changes, { transaction });
    }
}

/**
 * Troca do quarto principal: as contas abertas do quarto que sai passam para o quarto novo.
 *
 * A de diária continua cobrando a estadia no quarto em que o hóspede está (sem isso, a
 * recepção abria uma segunda conta de diária no quarto novo). As sem diária (conta dividida
 * da suíte) acompanham pelo mesmo motivo (D-5).
 *
 * Se já existe conta de diária desta estadia no quarto novo (dado anterior à correção de
 * 19/10), a troca é recusada em vez de deixar duas diárias no mesmo quarto (RN-005). A
 * resposta diz qual conta bloqueia; a recepção escolhe outro quarto ou pede ao administrador
 * para ajustar a conta — fechar não resolve, a de diária não fecha com a estadia em andamento
 * (D-41).
 *
 * @param {import('sequelize').Model} reservation travada pela transação
 * @param {string} fromRoomId quarto que sai
 * @param {string} toRoomId quarto que entra (id canônico do banco)
 * @param {import('sequelize').Transaction} transaction
 * @returns {Promise<{ error?: { status: number, message: string, accountIds: string[] } }>}
 */
export async function moveRoomAccounts(reservation, fromRoomId, toRoomId, transaction) {
    const accounts = await openAccountsOfRoom(reservation, fromRoomId, transaction);
    if (accounts.length === 0) return {};

    if (accounts.some((a) => a.charges_lodging)) {
        const taken = await lodgingAccountsOfRoom(reservation, toRoomId, transaction);
        if (taken.length > 0) {
            return {
                error: {
                    status: 409,
                    message: 'O quarto novo já tem conta cobrando diária desta reserva (RN-005) — escolha outro quarto ou peça ao administrador para ajustar essa conta antes de trocar',
                    accountIds: taken.map((a) => a.id)
                }
            };
        }
    }

    await relocate(accounts, reservation, fromRoomId, toRoomId, transaction);
    return {};
}

/**
 * Remoção de quarto extra: as contas abertas dele passam para o quarto principal.
 *
 * Nunca recusa e nunca apaga (🟡-1 e 🟡-2 da auditoria de 21/10): a família que devolve o
 * quarto extra não fica presa a ele, o consumo e os pagamentos da conta seguem intactos, e
 * a diária da estadia nunca fica sem conta.
 *
 * - O principal ainda **não** tem conta de diária desta reserva: a conta de diária do extra
 *   vai para lá cobrando a diária — passa a ser a conta de diária do principal.
 * - O principal **já** tem: a conta movida deixa de cobrar diária (`charges_lodging: false`)
 *   e vira conta dividida da suíte (D-5), preservando a RN-005. A diária fica na que já
 *   estava lá; a da conta aberta nunca foi gravada (D-39), então nada apresentado muda.
 *
 * @param {import('sequelize').Model} reservation travada pela transação (room_id = principal)
 * @param {string} roomId quarto extra que sai
 * @param {import('sequelize').Transaction} transaction
 */
export async function moveRemovedRoomAccounts(reservation, roomId, transaction) {
    const accounts = await openAccountsOfRoom(reservation, roomId, transaction);
    if (accounts.length === 0) return;

    const mainHasLodging = (await lodgingAccountsOfRoom(reservation, reservation.room_id, transaction)).length > 0;
    await relocate(accounts, reservation, roomId, reservation.room_id, transaction, { dropLodging: mainHasLodging });
}
