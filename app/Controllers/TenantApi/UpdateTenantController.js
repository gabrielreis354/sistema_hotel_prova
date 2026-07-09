import TenantModel from '../../Models/TenantModel.js';

/**
 * PUT /tenants/me
 * Atualiza a configuração do próprio hotel (somente ADMIN).
 *
 * Campos editáveis: name, legal_id, booking_enabled, deposit_percent.
 * NÃO editáveis aqui: subdomain (identidade — quebraria URLs públicas) e
 * status (nível de sistema/billing).
 */
export default async function UpdateTenantController(request, response) {
    try {
        const tenantId = request.user.tenantId;
        const { name, legal_id, booking_enabled, deposit_percent } = request.body;

        const tenant = await TenantModel.findByPk(tenantId);
        if (!tenant) return response.status(404).json({ error: 'Hotel não encontrado' });

        // Validações apenas dos campos enviados (update parcial).
        if (name !== undefined && (typeof name !== 'string' || name.trim() === '')) {
            return response.status(400).json({ error: 'name não pode ser vazio' });
        }
        if (booking_enabled !== undefined && typeof booking_enabled !== 'boolean') {
            return response.status(400).json({ error: 'booking_enabled deve ser booleano' });
        }
        if (deposit_percent !== undefined) {
            const n = Number(deposit_percent);
            if (!Number.isInteger(n) || n < 0 || n > 100) {
                return response.status(400).json({ error: 'deposit_percent deve ser inteiro entre 0 e 100' });
            }
        }

        if (name !== undefined)            tenant.name = name.trim();
        if (legal_id !== undefined)        tenant.legal_id = legal_id;
        if (booking_enabled !== undefined) tenant.booking_enabled = booking_enabled;
        if (deposit_percent !== undefined) tenant.deposit_percent = deposit_percent;

        await tenant.save();

        return response.status(200).json({
            id: tenant.id,
            name: tenant.name,
            subdomain: tenant.subdomain,
            legal_id: tenant.legal_id,
            status: tenant.status,
            booking_enabled: tenant.booking_enabled,
            deposit_percent: tenant.deposit_percent
        });
    } catch (error) {
        console.error('UpdateTenantController:', error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
