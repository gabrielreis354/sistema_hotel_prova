import TenantModel from '../../Models/TenantModel.js';

/**
 * GET /tenants/me
 * Retorna a configuração do hotel do usuário autenticado.
 * O tenant vem do JWT — nunca de um id na URL — garantindo isolamento multi-tenant.
 */
export default async function GetTenantController(request, response) {
    try {
        const tenantId = request.user.tenantId;

        const tenant = await TenantModel.findByPk(tenantId);
        if (!tenant) return response.status(404).json({ error: 'Hotel não encontrado' });

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
        console.error('GetTenantController:', error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
