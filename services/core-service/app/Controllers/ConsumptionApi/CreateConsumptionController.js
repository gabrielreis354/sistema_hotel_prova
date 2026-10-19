import sequelize from '../../../database/connections/sequelize.js';
import AccountModel from '../../Models/AccountModel.js';
import AccountItemModel from '../../Models/AccountItemModel.js';
import ReservationModel from '../../Models/ReservationModel.js';
import reservationRoomAccount from '../../utils/reservationRoomAccount.js';
import itemAsConsumption from '../../utils/itemAsConsumption.js';
import { MAX_PRICE } from '../../utils/productValidation.js';

/**
 * POST /reservations/:id/consumptions
 * Lança um consumo extra (frigobar, restaurante, spa) na reserva.
 *
 * Contrato antigo, mantido (CA-04.2.d): desde a T-04.2 o consumo vira item da conta da
 * suíte (criada se não existir) e a resposta mantém o formato de antes. Como antes,
 * aceita reserva de qualquer status (D-28) — a regra de check-in vale em /accounts.
 */
export default async function CreateConsumptionController(request, response) {
    try {
        const tenantId = request.user.tenantId;
        const reservationId = request.params.id;
        const { description, amount, consumed_at } = request.body;

        const errors = [];
        if (!description || String(description).trim() === '') errors.push('description obrigatório');
        const value = Number(amount);
        if (amount === undefined || !Number.isFinite(value) || value <= 0) errors.push('amount deve ser maior que zero');
        // A coluna nova é NUMERIC(10,2); acima disso o banco recusaria com 500.
        else if (value > MAX_PRICE) errors.push(`amount não pode exceder ${MAX_PRICE}`);
        if (consumed_at !== undefined && consumed_at !== null) {
            const when = new Date(consumed_at).getTime();
            if (Number.isNaN(when)) errors.push('consumed_at deve ser uma data válida');
            // Consumo é passado; 5 minutos de folga para o relógio do dispositivo (D-26).
            else if (when > Date.now() + 5 * 60 * 1000) errors.push('consumed_at não pode estar no futuro');
        }
        if (errors.length) return response.status(400).json({ errors });

        // Isolamento: a reserva precisa pertencer ao tenant do usuário.
        const reservation = await ReservationModel.findOne({
            where: { id: reservationId, tenant_id: tenantId }
        });
        if (!reservation) return response.status(404).json({ error: 'Reserva não encontrada' });

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
