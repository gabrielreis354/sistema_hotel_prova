import TenantModel from '../app/Models/TenantModel.js';

export default async function tenantMiddleware(request, response, next) {
    const tenantId = request.user?.tenantId;

    if (!tenantId) {
        return response.status(401).json({ error: 'Tenant não identificado' });
    }

    try {
        const tenant = await TenantModel.findByPk(tenantId);

        if (!tenant) {
            return response.status(401).json({ error: 'Tenant não encontrado' });
        }

        if (tenant.status !== 'ACTIVE') {
            return response.status(403).json({ error: 'Conta suspensa' });
        }

        request.tenantId = tenantId;
        next();
    } catch {
        return response.status(500).json({ error: 'Internal server error' });
    }
}
