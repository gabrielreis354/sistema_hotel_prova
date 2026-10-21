import { Op } from 'sequelize';
import AccountModel from '../Models/AccountModel.js';
import AccountItemModel from '../Models/AccountItemModel.js';
import PaymentModel from '../Models/PaymentModel.js';
import RoomModel from '../Models/RoomModel.js';
import { roomAccountLabel } from './reservationRoomAccount.js';

// Contas da estadia num quarto que sai da reserva (repasse do qa-redteam de 19/10).
// A conta ROOM pertence ao quarto DA ESTADIA (D-5), e cada quarto da estadia tem no máximo
// uma conta cobrando diária (RN-005 / D-3). Quem troca ou remove o quarto cuida das contas
// dele na mesma transação — antes, a conta ficava apontando para um quarto que o hóspede
// deixou, e o realinhamento da D-32 só acontecia no próximo lançamento.
//
// Só conta ABERTA muda: a fechada ou paga já foi apresentada e não muda mais (D-23, D-39).
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

// paranoid: false — um quarto desativado depois não apaga o histórico da estadia.
const roomOf = (id, tenantId, transaction) =>
    RoomModel.findOne({ where: { id, tenant_id: tenantId }, attributes: ['id', 'number'], paranoid: false, transaction });

/**
 * Troca do quarto principal: as contas abertas do quarto que sai passam para o quarto novo.
 *
 * A de diária continua cobrando a estadia no quarto em que o hóspede está (sem isso, a
 * recepção abria uma segunda conta de diária no quarto novo). As sem diária (conta dividida
 * da suíte) acompanham pelo mesmo motivo (D-5). O rótulo só acompanha se for o que o sistema
 * gerou ("Suíte 906"); o escolhido pela recepção fica como está (D-32, reauditoria N-4).
 *
 * Se já existe conta de diária desta estadia no quarto novo (dado anterior a esta correção),
 * a troca é recusada em vez de deixar duas diárias no mesmo quarto (RN-005).
 *
 * @param {import('sequelize').Model} reservation travada pela transação, ainda com o quarto antigo lido antes
 * @param {string} fromRoomId quarto que sai
 * @param {string} toRoomId quarto que entra (id canônico do banco)
 * @param {import('sequelize').Transaction} transaction
 * @returns {Promise<{ error?: { status: number, message: string } }>}
 */
export async function moveRoomAccounts(reservation, fromRoomId, toRoomId, transaction) {
    const accounts = await openAccountsOfRoom(reservation, fromRoomId, transaction);
    if (accounts.length === 0) return {};

    if (accounts.some((a) => a.charges_lodging)) {
        const taken = await AccountModel.count({
            where: { tenant_id: reservation.tenant_id, reservation_id: reservation.id, room_id: toRoomId, charges_lodging: true },
            transaction
        });
        if (taken > 0) {
            return { error: { status: 409, message: 'O quarto novo já tem conta cobrando diária desta reserva — feche ou ajuste as contas antes de trocar (RN-005)' } };
        }
    }

    // Em sequência, não Promise.all: dentro da transação as consultas dividem a conexão.
    const oldRoom = await roomOf(fromRoomId, reservation.tenant_id, transaction);
    const newRoom = await roomOf(toRoomId, reservation.tenant_id, transaction);
    const systemLabel = oldRoom ? roomAccountLabel(oldRoom.number) : null;

    for (const account of accounts) {
        const changes = { room_id: toRoomId };
        if (newRoom && account.label === systemLabel) changes.label = roomAccountLabel(newRoom.number);
        await account.update(changes, { transaction });
    }
    return {};
}

/**
 * Remoção de quarto extra: as contas abertas dele precisam sair junto.
 *
 * - Conta aberta **vazia** (sem item e sem pagamento): é desligada (soft delete). A diária
 *   da conta aberta nunca foi gravada (D-39): calculada a cada leitura, ela passa para as
 *   contas que ficam pelo rateio da D-40 — nada apresentado é desfeito.
 * - Conta aberta **com item ou pagamento**: recusa a remoção (409). Apagar a conta sumiria
 *   com consumo ou dinheiro; deixá-la apontando para fora da estadia é o defeito do repasse.
 *   A recepção trata antes (o ADMIN exclui o item lançado por engano, ou o consumo segue em
 *   outra conta).
 *
 * Item ou pagamento excluídos (soft delete) não contam: já não cobram nem abatem.
 *
 * @returns {Promise<{ error?: { status: number, message: string, accountIds: string[] } }>}
 */
export async function releaseRemovedRoomAccounts(reservation, roomId, transaction) {
    const accounts = await openAccountsOfRoom(reservation, roomId, transaction);
    if (accounts.length === 0) return {};

    const ids = accounts.map((a) => a.id);
    const where = { account_id: { [Op.in]: ids }, tenant_id: reservation.tenant_id };
    const items = await AccountItemModel.findAll({ where, attributes: ['account_id'], transaction });
    const payments = await PaymentModel.findAll({ where, attributes: ['account_id'], transaction });
    const busy = new Set([...items, ...payments].map((row) => row.account_id));
    if (busy.size > 0) {
        return {
            error: {
                status: 409,
                message: 'O quarto tem conta aberta com lançamento ou pagamento — acerte a conta antes de remover o quarto da reserva',
                accountIds: ids.filter((id) => busy.has(id))
            }
        };
    }

    for (const account of accounts) await account.destroy({ transaction });
    return {};
}
