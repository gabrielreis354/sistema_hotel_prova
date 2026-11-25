import GuestModel from '../../Models/GuestModel.js';
import { logError } from '../../utils/logError.js';

export default async function GetGuestController(request, response) {
    try {
        const { id } = request.params;
        const tenantId = request.user.tenantId;
        const guest = await GuestModel.findOne({ where: { id, tenant_id: tenantId } });
        if (!guest) return response.status(404).json({ error: 'Hóspede não encontrado' });
        return response.json(guest);
    } catch (error) {
        logError('GetGuestController', error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
