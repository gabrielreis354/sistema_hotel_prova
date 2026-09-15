import GuestModel from '../../Models/GuestModel.js';

export default async function UpdateGuestController(request, response) {
    try {
        const { id } = request.params;
        const tenantId = request.user.tenantId;
        const { full_name, cpf, phone, email } = request.body;

        const guest = await GuestModel.findOne({ where: { id, tenant_id: tenantId } });
        if (!guest) return response.status(404).json({ error: 'Hóspede não encontrado' });

        if (full_name !== undefined) guest.full_name = full_name;
        if (cpf !== undefined)       guest.cpf = cpf;
        if (phone !== undefined)     guest.phone = phone;
        if (email !== undefined)     guest.email = email;

        await guest.save();
        return response.json(guest);
    } catch (error) {
        console.error(error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
