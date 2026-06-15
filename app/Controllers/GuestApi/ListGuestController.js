import GuestModel from '../../Models/GuestModel.js';

export default async function ListGuestController(request, response) {
    try {
        const tenantId = request.user.tenantId;
        const guests = await GuestModel.findAll({ where: { tenant_id: tenantId } });
        return response.json(guests);
    } catch (error) {
        console.error(error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
