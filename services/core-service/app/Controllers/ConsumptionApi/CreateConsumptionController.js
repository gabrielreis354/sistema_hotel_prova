import sequelize from '../../../database/connections/sequelize.js';
import AccountModel from '../../Models/AccountModel.js';
import AccountItemModel from '../../Models/AccountItemModel.js';
import ReservationModel from '../../Models/ReservationModel.js';
import reservationRoomAccount from '../../utils/reservationRoomAccount.js';
import itemAsConsumption from '../../utils/itemAsConsumption.js';
import { MAX_PRICE } from '../../utils/productValidation.js';

const MAX_DESCRIPTION = 200;
const TWO_DECIMALS = /^\d+(\.\d{1,2})?$/;
const CLOSED_STAY_STATUSES = ['CHECKED_OUT', 'CANCELLED'];

/**
 * POST /reservations/:id/consumptions
 * Lança um consumo extra (frigobar, restaurante, spa) na reserva.
 *
 * Contrato antigo, mantido (CA-04.2.d): desde a T-04.2 o consumo vira item da conta da
 * suíte (criada se não existir) e a resposta mantém o formato de antes. Como antes,
 * aceita reserva sem check-in (D-28) — a regra de check-in vale em /accounts. Estadia
 * encerrada (check-out ou cancelada) não recebe mais consumo (D-30).
 */
export default async function CreateConsumptionController(request, response) {
    try {
        const tenantId = request.user.tenantId;
        const reservationId = request.params.id;
        const { description, amount, consumed_at } = request.body;

        const errors = [];
        if (typeof description !== 'string' || description.trim() === '') errors.push('description obrigatório');
        else if (description.trim().length > MAX_DESCRIPTION) errors.push(`description não pode passar de ${MAX_DESCRIPTION} caracteres`);

        // Mesmo rigor de /accounts: número, ou texto decimal, com até 2 casas. Number()
        // sozinho aceitava true (1), [5] (5) e '0.001' (vira item de R$ 0,00).
        const value = typeof amount === 'number' || (typeof amount === 'string' && TWO_DECIMALS.test(amount.trim()))
            ? Number(amount) : NaN;
        if (!Number.isFinite(value) || value <= 0 || !TWO_DECIMALS.test(String(value))) {
            errors.push('amount deve ser maior que zero, com até 2 casas decimais');
        } else if (value > MAX_PRICE) {
            // A coluna nova é NUMERIC(10,2); acima disso o banco recusaria com 500.
            errors.push(`amount não pode exceder ${MAX_PRICE}`);
        }

        if (consumed_at !== undefined && consumed_at !== null) {
            const when = typeof consumed_at === 'string' ? new Date(consumed_at).getTime() : NaN;
            if (Number.isNaN(when)) errors.push('consumed_at deve ser uma data válida (texto ISO 8601)');
            // Consumo é passado. A folga de 1 minuto é a mesma do reparo de consumed_at no
            // migrate, para nenhum lançamento válido ser alterado depois (D-26).
            else if (when > Date.now() + 60 * 1000) errors.push('consumed_at não pode estar no futuro');
        }
        if (errors.length) return response.status(400).json({ errors });

        // Isolamento: a reserva precisa pertencer ao tenant do usuário.
        const reservation = await ReservationModel.findOne({
            where: { id: reservationId, tenant_id: tenantId }
        });
        if (!reservation) return response.status(404).json({ error: 'Reserva não encontrada' });

        // Estadia encerrada não recebe consumo (D-30, mesma regra da D-22 em /accounts).
        if (CLOSED_STAY_STATUSES.includes(reservation.status)) {
            return response.status(422).json({ error: `Reserva ${reservation.status} não recebe consumo novo` });
        }

        const account = await reservationRoomAccount(reservation);
        const cents = Math.round(value * 100);

        let item;
        const transaction = await sequelize.transaction();
        try {
            // Mesma trava do lançamento por /accounts: não intercala com o fechamento (T-04.3).
            const locked = await AccountModel.findOne({
                where: { id: account.id, tenant_id: tenantId },
                lock: transaction.LOCK.UPDATE,
                transaction
            });
            if (locked.status !== 'OPEN') {
                await transaction.rollback();
                return response.status(422).json({ error: `Conta ${locked.status} não aceita consumo novo` });
            }
            // De novo, com a conta travada: um encerramento entre a primeira leitura e a criação
            // da conta não fecharia esta conta, criada depois dele (🟢-1 da T-04.3, D-36).
            const current = await ReservationModel.findOne({
                where: { id: reservationId, tenant_id: tenantId }, attributes: ['status'], transaction
            });
            if (!current || CLOSED_STAY_STATUSES.includes(current.status)) {
                await transaction.rollback();
                return response.status(422).json({ error: `Reserva ${current?.status ?? 'excluída'} não recebe consumo novo` });
            }

            item = await AccountItemModel.create({
                tenant_id: tenantId,
                account_id: account.id,
                description: String(description).trim(),
                quantity: 1,
                unit_price: (cents / 100).toFixed(2),
                total: (cents / 100).toFixed(2),
                billable: true,
                created_by: request.user.userId,
                // Sem consumed_at, vale o default do banco (agora).
                ...(consumed_at ? { consumed_at: new Date(consumed_at) } : {})
            }, { transaction });

            await transaction.commit();
        } catch (error) {
            await transaction.rollback();
            throw error;
        }

        return response.status(201).json(itemAsConsumption(await item.reload(), reservationId));
    } catch (error) {
        console.error('CreateConsumptionController:', error.message);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
