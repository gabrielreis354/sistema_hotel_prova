import sequelize from '../../../database/connections/sequelize.js';
import ContractModel from '../../Models/ContractModel.js';
import CorporateClientModel from '../../Models/CorporateClientModel.js';
import RoomModel from '../../Models/RoomModel.js';
import GuestModel from '../../Models/GuestModel.js';
import ReservationModel from '../../Models/ReservationModel.js';
import ReservationRoomModel from '../../Models/ReservationRoomModel.js';
import { findConflictingRooms, isRoomOccupiedError, ROOM_OCCUPIED_MESSAGE } from '../../utils/checkReservationConflict.js';

// Encontra o hóspede que já representa esse cliente corporativo (por CPF) ou cria um novo.
// Se telefone/e-mail já pertencerem a outro hóspede do tenant (unique constraint), cria
// só com o nome — não é motivo para travar a assinatura do contrato.
async function findOrCreateRepresentanteGuest(tenantId, client, transaction) {
    if (client.representante_cpf) {
        const existing = await GuestModel.findOne({ where: { tenant_id: tenantId, cpf: client.representante_cpf }, transaction });
        if (existing) return existing;
    }
    try {
        return await GuestModel.create({
            tenant_id: tenantId,
            full_name: client.representante_nome,
            cpf: client.representante_cpf || null,
            phone: client.telefone || null,
            email: client.email || null
        }, { transaction });
    } catch (err) {
        if (err.name === 'SequelizeUniqueConstraintError') {
            return await GuestModel.create({ tenant_id: tenantId, full_name: client.representante_nome }, { transaction });
        }
        throw err;
    }
}

/**
 * PUT /contracts/:id/sign
 * Confirma o contrato e BLOQUEIA os quartos escolhidos no período do evento —
 * cria uma reserva-bloco (source: B2B) para que a recepção não venda esses
 * quartos avulso no mesmo período (overbooking).
 *
 * Body: { room_ids: [uuid, ...] }
 */
export default async function SignContractController(request, response) {
    try {
        const tenantId = request.user.tenantId;
        const userId = request.user.userId;
        const { room_ids } = request.body;

        const contract = await ContractModel.findOne({ where: { id: request.params.id, tenant_id: tenantId } });
        if (!contract) return response.status(404).json({ error: 'Contrato não encontrado' });
        if (contract.status !== 'GENERATED') {
            return response.status(409).json({ error: `Contrato não pode ser assinado no status atual (${contract.status})` });
        }

        if (!Array.isArray(room_ids) || room_ids.length === 0) {
            return response.status(400).json({ error: 'room_ids é obrigatório e deve conter ao menos um quarto' });
        }
        const uniqueRoomIds = [...new Set(room_ids)];

        const client = await CorporateClientModel.findOne({ where: { id: contract.corporate_client_id, tenant_id: tenantId } });
        if (!client) return response.status(404).json({ error: 'Cliente corporativo não encontrado' });
        if (!client.representante_nome) {
            return response.status(400).json({ error: 'Cliente não possui representante legal cadastrado' });
        }

        // Validar todos os quartos ANTES de escrever qualquer coisa no banco.
        for (const roomId of uniqueRoomIds) {
            const room = await RoomModel.findOne({ where: { id: roomId, tenant_id: tenantId } });
            if (!room) return response.status(404).json({ error: `Quarto não encontrado: ${roomId}` });
        }

        // Todos os quartos contra todos os ocupados no período — inclusive quartos extras de
        // outras reservas, que antes eram invisíveis aqui (P-1).
        const conflictingRoomIds = await findConflictingRooms(uniqueRoomIds, contract.check_in, contract.check_out, null, tenantId);
        if (conflictingRoomIds.length > 0) {
            return response.status(409).json({ error: 'Quarto(s) indisponível(is) no período do evento', room_ids: conflictingRoomIds });
        }

        const t = await sequelize.transaction();
        try {
            // Relê o contrato com lock: um cancelamento simultâneo não pode deixar o contrato
            // CANCELLED com uma reserva-bloco recém-criada segurando os quartos.
            const locked = await ContractModel.findOne({ where: { id: contract.id, tenant_id: tenantId }, lock: t.LOCK.UPDATE, transaction: t });
            if (!locked || locked.status !== 'GENERATED') {
                await t.rollback();
                return response.status(409).json({ error: `Contrato não pode ser assinado no status atual (${locked?.status ?? 'removido'})` });
            }

            const guest = await findOrCreateRepresentanteGuest(tenantId, client, t);

            const reservation = await ReservationModel.create({
                tenant_id: tenantId,
                guest_id: guest.id,
                room_id: uniqueRoomIds[0],
                user_id: userId,
                check_in_date: contract.check_in,
                check_out_date: contract.check_out,
                status: 'CONFIRMED',
                total_amount: contract.total,
                source: 'B2B'
            }, { transaction: t });

            // Quartos 2..N no pivô; o primeiro (room_id) o banco já pôs, pelo trigger. É no pivô
            // que o EXCLUDE os protege — antes, os 2..N ficavam livres para a recepção vender.
            for (const roomId of uniqueRoomIds.slice(1)) {
                await ReservationRoomModel.create({ reservation_id: reservation.id, room_id: roomId }, { transaction: t });
            }

            contract.status = 'SIGNED';
            contract.reservation_id = reservation.id;
            await contract.save({ transaction: t });

            await t.commit();
            return response.status(200).json({ ...contract.toJSON(), reservation: reservation.toJSON() });
        } catch (err) {
            if (!t.finished) await t.rollback();
            throw err;
        }
    } catch (error) {
        if (isRoomOccupiedError(error)) return response.status(409).json({ error: ROOM_OCCUPIED_MESSAGE });
        console.error('SignContractController:', error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
