import GuestModel from '../../Models/GuestModel.js';

export default async function CreateGuestController(request, response) {
    try {
        const tenantId = request.user.tenantId;
        const { full_name, cpf, phone, email } = request.body;

        if (!full_name) return response.status(400).json({ error: 'full_name obrigatório' });

        const guest = await GuestModel.create({
            tenant_id: tenantId,
            full_name,
            cpf: cpf || null,
            phone: phone || null,
            email: email || null
        });
        return response.status(201).json(guest);
    } catch (error) {
        console.error(error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
