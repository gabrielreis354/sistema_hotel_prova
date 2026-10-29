import sequelize from '../../../database/connections/sequelize.js';
import AccountModel from '../../Models/AccountModel.js';
import ReservationModel from '../../Models/ReservationModel.js';
import ReservationRoomModel from '../../Models/ReservationRoomModel.js';
import RoomModel from '../../Models/RoomModel.js';
import GuestModel from '../../Models/GuestModel.js';
import { ACCOUNT_TYPES } from '../../utils/accountEnums.js';
import { realignStaleLodgingAccount } from '../../utils/reservationRoomAccount.js';
import accountRuleViolation from '../../utils/accountRuleViolation.js';
import isUuid from '../../utils/isUuid.js';

const LINK_FIELDS = ['reservation_id', 'room_id', 'guest_id'];

// D-5: vínculos por tipo de conta. O que não está listado é livre (opcional).
// Os mesmos limites são CHECKs no banco (applyAccountConstraints); aqui viram 422
// com a regra explicada, em vez de depender da recusa do banco.
const LINK_RULES = {
    ROOM:     { required:  ['reservation_id', 'room_id', 'guest_id'] },
    DAY_USE:  { forbidden: ['reservation_id'] },
    TABLE:    { forbidden: ['reservation_id', 'guest_id'] },
    DIRECT:   { forbidden: ['reservation_id'] },
    INTERNAL: { forbidden: ['reservation_id', 'guest_id'] }
};

// D-8: o garçom abre mesa e balcão. Suíte, day-use e conta interna envolvem hóspede
// ou custo do hotel — ficam com a recepção.
const WAITER_ACCOUNT_TYPES = ['TABLE', 'DIRECT'];

const provided = (value) => value !== undefined && value !== null;

// Rótulo de tela ("Mesa 5", "Suíte 201 — João"): sem teto, 50 mil caracteres passavam.
const MAX_LABEL = 100;

function validateInput(body) {
    const errors = [];

    if (!ACCOUNT_TYPES.includes(body.type)) {
        errors.push(`type deve ser um de: ${ACCOUNT_TYPES.join(', ')}`);
    }
    if (typeof body.label !== 'string' || !body.label.trim()) {
        errors.push('label é obrigatório');
    } else if (body.label.trim().length > MAX_LABEL) {
        errors.push(`label não pode passar de ${MAX_LABEL} caracteres`);
    }
    for (const field of LINK_FIELDS) {
        if (provided(body[field]) && !isUuid(body[field])) errors.push(`${field} deve ser um UUID`);
    }
    if (provided(body.charges_lodging) && typeof body.charges_lodging !== 'boolean') {
        errors.push('charges_lodging deve ser booleano');
    }

    return errors;
}

function typeRuleError(body) {
    const { required = [], forbidden = [] } = LINK_RULES[body.type];

    const missing = required.find((field) => !provided(body[field]));
    if (missing) return `Conta ${body.type} exige ${missing}`;

    const extra = forbidden.find((field) => provided(body[field]));
    if (extra) return `Conta ${body.type} não aceita ${extra}`;

    // D-4: não existe diária em mesa, balcão, day-use nem conta interna.
    if (body.type !== 'ROOM' && body.charges_lodging === true) {
        return 'Só conta ROOM cobra diária (charges_lodging)';
    }

    return null;
}

/**
 * POST /accounts
 * Abre uma conta (comanda). Toda conta nasce OPEN — fechar é a T-04.3.
 */
export default async function CreateAccountController(request, response) {
    let transaction;
    const fail = async (status, body) => {
        await transaction.rollback();
        return response.status(status).json(body);
    };
    try {
        const tenantId = request.user.tenantId;
        const body = request.body ?? {};

        const errors = validateInput(body);
        if (errors.length) return response.status(400).json({ errors });

        if (request.user.role === 'WAITER' && !WAITER_ACCOUNT_TYPES.includes(body.type)) {
            return response.status(403).json({ error: 'Acesso não autorizado' });
        }

        const ruleError = typeRuleError(body);
        if (ruleError) return response.status(422).json({ error: ruleError });

        const { type, reservation_id, room_id, guest_id } = body;

        // As FKs só garantem que o registro existe, não que é deste hotel.
        // Outro hotel responde 404, como em todo o sistema: não confirma que o id existe.
        if (provided(guest_id)) {
            const guest = await GuestModel.findOne({ where: { id: guest_id, tenant_id: tenantId } });
            if (!guest) return response.status(404).json({ error: 'Hóspede não encontrado' });
        }
        if (provided(room_id)) {
            const room = await RoomModel.findOne({ where: { id: room_id, tenant_id: tenantId } });
            if (!room) return response.status(404).json({ error: 'Quarto não encontrado' });
        }

        // Fora de ROOM grava false explicitamente: o default da coluna é true (MER) e o
        // CHECK accounts_charges_lodging_room_only recusaria o INSERT (D-4).
        const chargesLodging = type === 'ROOM' ? body.charges_lodging ?? true : false;

        if (type === 'ROOM') {
            const found = await ReservationModel.findOne({
                where: { id: reservation_id, tenant_id: tenantId }, attributes: ['id']
            });
            if (!found) return response.status(404).json({ error: 'Reserva não encontrada' });

            // Conta da suíte depende dos quartos da estadia e das outras contas dela: trava a
            // reserva antes de checar, na ordem do projeto (D-48: reserva → contas). Sem isso,
            // uma remoção de quarto extra que move a conta de diária para o principal e esta
            // criação se cruzavam (trava da reserva × índice único) e o banco derrubava uma
            // delas com deadlock — 500 (N-1 da reauditoria delta de 21/10). Com a trava, quem
            // chega depois espera e enxerga o que o outro gravou.
            transaction = await sequelize.transaction();
            const reservation = await ReservationModel.findOne({
                where: { id: reservation_id, tenant_id: tenantId },
                lock: transaction.LOCK.UPDATE,
                transaction
            });
            if (!reservation) return await fail(404, { error: 'Reserva não encontrada' });

            // Consumo na suíte só durante a estadia: antes do check-in o hóspede não está
            // no hotel; depois do check-out a conta da suíte já deveria estar fechada.
            if (reservation.status !== 'CHECKED_IN') {
                return await fail(422, {
                    error: `Conta ROOM exige reserva com check-in feito (status atual: ${reservation.status})`
                });
            }

            // reservation_rooms tem todos os quartos da reserva, inclusive o principal
            // (trigger reservations_sincroniza_quartos) — cobre a reserva multiquarto.
            const roomInStay = await ReservationRoomModel.findOne({ where: { reservation_id, room_id }, transaction });
            if (!roomInStay) {
                return await fail(422, { error: 'O quarto não pertence a esta reserva' });
            }

            // RN-005 (D-3): uma conta cobrando a diária por quarto da estadia. Checagem
            // prévia para a mensagem; a corrida que passar daqui o índice único barra.
            if (chargesLodging) {
                // Uma troca de quarto pode ter deixado a conta da diária no quarto antigo:
                // realinhada antes, a checagem abaixo a enxerga (D-32, reauditoria N-1).
                // Fora desta transação, como sempre foi (o realinhamento trata a própria
                // corrida pelo índice, e o erro abortaria a transação em volta). Não espera a
                // trava acima: só muda room_id/label de conta, sem tocar a linha da reserva.
                await realignStaleLodgingAccount(reservation);

                const lodging = await AccountModel.findOne({
                    where: { tenant_id: tenantId, reservation_id, room_id, charges_lodging: true },
                    transaction
                });
                if (lodging) {
                    return await fail(422, {
                        error: 'Já existe uma conta cobrando a diária deste quarto nesta estadia (RN-005)'
                    });
                }
            }
        }

        // Campos montados um a um: status, tenant_id e datas nunca vêm do cliente.
        const account = await AccountModel.create({
            tenant_id: tenantId,
            type,
            label: body.label.trim(),
            reservation_id: reservation_id ?? null,
            room_id: room_id ?? null,
            guest_id: guest_id ?? null,
            charges_lodging: chargesLodging,
            status: 'OPEN'
        }, { transaction });
        if (transaction) await transaction.commit();

        return response.status(201).json(account);
    } catch (error) {
        if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
        const violation = accountRuleViolation(error, response);
        if (violation) return violation;
        console.error('CreateAccountController:', error.message);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
