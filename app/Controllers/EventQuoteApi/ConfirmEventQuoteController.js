import EventQuoteModel from '../../Models/EventQuoteModel.js';

// Allowlist explícita: só orçamento recém-enviado pode ser confirmado — fail-safe.
const CONFIRMABLE_STATUSES = ['SENT'];

const CONFIRM_BLOCKED_MESSAGES = {
    CONFIRMED: 'Orçamento já está confirmado',
    CANCELLED: 'Não é possível confirmar um orçamento cancelado',
};

export default async function ConfirmEventQuoteController(request, response) {
    try {
        const tenantId = request.user.tenantId;
        const quote = await EventQuoteModel.findOne({ where: { id: request.params.id, tenant_id: tenantId } });
        if (!quote) return response.status(404).json({ error: 'Orçamento não encontrado' });

        if (!CONFIRMABLE_STATUSES.includes(quote.status)) {
            const message = CONFIRM_BLOCKED_MESSAGES[quote.status]
                ?? `Confirmação não permitida no status '${quote.status}'`;
            return response.status(409).json({ error: message });
        }

        quote.status = 'CONFIRMED';
        await quote.save();

        return response.json(quote);
    } catch (error) {
        console.error('ConfirmEventQuoteController:', error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
