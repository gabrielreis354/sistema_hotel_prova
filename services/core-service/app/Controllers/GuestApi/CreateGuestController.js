import GuestModel from '../../Models/GuestModel.js';
import uniqueConstraintConflict from '../../utils/uniqueConstraintConflict.js';
import isNonBlankString from '../../utils/isNonBlankString.js';
import { checkNewCpf, isBlankCpf } from '../../utils/guestCpf.js';
import { logError } from '../../utils/logError.js';

export default async function CreateGuestController(request, response) {
    try {
        const tenantId = request.user.tenantId;
        const { full_name, cpf, phone, email } = request.body;

        if (!isNonBlankString(full_name)) return response.status(400).json({ error: 'full_name obrigatório' });

        // CPF opcional; preenchido, tem de ser válido e é gravado só com dígitos (SPEC-11, T-11.1).
        let cpfDigits = null;
        if (cpf !== undefined && !isBlankCpf(cpf)) {
            const checked = await checkNewCpf(tenantId, cpf);
            if (checked.error) return response.status(checked.status).json({ error: checked.error });
            cpfDigits = checked.digits;
        }

        const guest = await GuestModel.create({
            tenant_id: tenantId,
            full_name,
            cpf: cpfDigits,
            phone: phone || null,
            email: email || null
        });
        return response.status(201).json(guest);
    } catch (error) {
        // Race no check-then-act acima: o índice único barra a segunda gravação.
        // Sem isto o conflito do cliente viraria 500.
        const conflito = uniqueConstraintConflict(error, response);
        if (conflito) return conflito;
        logError('CreateGuestController', error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
