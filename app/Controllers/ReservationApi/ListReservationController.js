import { Op } from 'sequelize';
import ReservationModel from '../../Models/ReservationModel.js';
import GuestModel from '../../Models/GuestModel.js';
import RoomModel from '../../Models/RoomModel.js';
import UserModel from '../../Models/UserModel.js';

export default async function ListReservationController(request, response) {
    try {
        const tenantId = request.user.tenantId;
        const { from, to, page, limit } = request.query;

        const where = { tenant_id: tenantId };

        // Filtro por período: devolve as reservas que se SOBREPÕEM ao intervalo
        // [from, to] — check_in <= to AND check_out >= from. É o que o rack precisa
        // para pintar só a faixa de datas visível, em vez do tenant inteiro.
        if (to)   where.check_in_date  = { [Op.lte]: to };
        if (from) where.check_out_date = { [Op.gte]: from };

        const include = [
            { model: GuestModel, as: 'guest', attributes: ['id', 'full_name', 'email'] },
            { model: RoomModel,  as: 'room',  attributes: ['id', 'number', 'floor'] },
            { model: UserModel,  as: 'user',  attributes: ['id', 'name'] }
        ];
        const order = [['check_in_date', 'ASC']];

        // Paginação só quando o cliente pede (page ou limit na query). Sem eles,
        // mantém o contrato antigo — array puro — para não quebrar quem já consome.
        const wantsPagination = page !== undefined || limit !== undefined;

        if (!wantsPagination) {
            const reservations = await ReservationModel.findAll({ where, include, order });
            return response.json(reservations);
        }

        const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
        const parsedPage  = Math.max(parseInt(page, 10) || 1, 1);
        const offset = (parsedPage - 1) * parsedLimit;

        // distinct para o count não inflar caso um include vire hasMany no futuro.
        const { rows, count } = await ReservationModel.findAndCountAll({
            where, include, order, limit: parsedLimit, offset, distinct: true
        });

        return response.json({
            data: rows,
            total: count,
            page: parsedPage,
            limit: parsedLimit
        });
    } catch (error) {
        console.error(error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
