import EventQuoteModel from '../../Models/EventQuoteModel.js';

// Allowlist explícita: apenas esses status podem ser cancelados — fail-safe.
const CANCELLABLE_STATUSES = ['SENT', 'CONFIRMED'];

const CANCEL_BLOCKED_MESSAGES = {
    CANCELLED: 'Orçamento já está cancelado',
};

export default async function CancelEventQuoteController(request, response) {
    try {
        const tenantId = request.user.tenantId;
        const quote = await EventQuoteModel.findOne({ where: { id: request.params.id, tenant_id: tenantId } });
        if (!quote) return response.status(404).json({ error: 'Orçamento não encontrado' });

        if (!CANCELLABLE_STATUSES.includes(quote.status)) {
            const message = CANCEL_BLOCKED_MESSAGES[quote.status]
                ?? `Cancelamento não permitido no status '${quote.status}'`;
            return response.status(409).json({ error: message });
        }

        quote.status = 'CANCELLED';
        await quote.save();

        return response.json(quote);
    } catch (error) {
        console.error('CancelEventQuoteController:', error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
