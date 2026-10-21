import {
    RoomCategoryProjection, RoomProjection, GuestProjection, ReservationProjection, PaymentProjection
} from '../../Models/index.js';

const PROJECOES = {
    room_categories: RoomCategoryProjection,
    rooms: RoomProjection,
    guests: GuestProjection,
    reservations: ReservationProjection,
    payments: PaymentProjection
};

/**
 * GET /analytics/health — saúde AUTENTICADA (H.2): prova, antes das consultas da H.3, que o token do
 * core é aceito aqui e que o hotel só enxerga as próprias projeções (CA-01.4.m). Devolve quantos
 * registros vivos (sem marca de exclusão) cada projeção tem para o hotel do token.
 * Quem usa: ADMIN/RECEPTIONIST, ao conferir se a carga inicial (CA-01.4.j) já chegou.
 */
export default async function GetProjectionStatusController(request, response) {
    try {
        const tenantId = request.tenantId;   // do JWT, conferido pelo tenantMiddleware

        const contagens = {};
        for (const [nome, Model] of Object.entries(PROJECOES)) {
            contagens[nome] = await Model.count({ where: { tenant_id: tenantId, deleted_at: null } });
        }

        return response.status(200).json({ status: 'OK', tenant_id: tenantId, projections: contagens });
    } catch (error) {
        console.error('GetProjectionStatusController:', error.message);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
