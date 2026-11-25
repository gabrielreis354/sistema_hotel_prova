import GuestModel from '../../Models/GuestModel.js';
import uniqueConstraintConflict from '../../utils/uniqueConstraintConflict.js';
import isNonBlankString from '../../utils/isNonBlankString.js';
import { checkNewCpf, cpfChanged, isBlankCpf } from '../../utils/guestCpf.js';
import { logError } from '../../utils/logError.js';

export default async function UpdateGuestController(request, response) {
    try {
        const { id } = request.params;
        const tenantId = request.user.tenantId;
        const { full_name, cpf, phone, email } = request.body;

        // Nome é opcional na edição, mas se vier não pode ser branco nem outro tipo (fail fast).
        if (full_name !== undefined && !isNonBlankString(full_name)) {
            return response.status(400).json({ error: 'full_name não pode ficar em branco' });
        }

        const guest = await GuestModel.findOne({ where: { id, tenant_id: tenantId } });
        if (!guest) return response.status(404).json({ error: 'Hóspede não encontrado' });

        if (full_name !== undefined) guest.full_name = full_name;
        // Só o CPF que muda é validado (parecer de 22/11, 🟡2); reenviado igual, fica como está.
        if (cpf !== undefined && cpfChanged(cpf, guest.cpf)) {
            if (isBlankCpf(cpf)) {
                guest.cpf = null;
            } else {
                const checked = await checkNewCpf(tenantId, cpf, { excludeId: guest.id });
                if (checked.error) return response.status(checked.status).json({ error: checked.error });
                guest.cpf = checked.digits;
            }
        }
        if (phone !== undefined)     guest.phone = phone;
        if (email !== undefined)     guest.email = email;

        await guest.save();
        return response.json(guest);
    } catch (error) {
        // Race no check-then-act acima: o índice único barra a segunda gravação.
        // Sem isto o conflito do cliente viraria 500.
        const conflito = uniqueConstraintConflict(error, response);
        if (conflito) return conflito;
        logError('UpdateGuestController', error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
