import GuestModel from '../../Models/GuestModel.js';

export default async function DeleteGuestController(request, response) {
    try {
        const { id } = request.params;
        const tenantId = request.user.tenantId;
        const guest = await GuestModel.findOne({ where: { id, tenant_id: tenantId } });
        if (!guest) return response.status(404).json({ error: 'Hóspede não encontrado' });
        await guest.destroy();
        return response.status(204).send();
    } catch (error) {
        console.error(error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
