import TenantProjection from '../app/Models/TenantProjection.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Hotel do token precisa existir e estar ACTIVE (catálogo §4.1) — o mesmo comportamento do
 * tenantMiddleware do core, lido da projeção `proj_tenants`. Allowlist: só ACTIVE passa; qualquer
 * outro status (inclusive um que ainda não exista) recebe 403.
 *
 * Hotel que ainda não chegou à projeção (evento `tenant.created` em trânsito, carga inicial não
 * rodada) recebe 401, como o core faz para tenant inexistente: falha fechada.
 */
export default async function tenantMiddleware(request, response, next) {
    const tenantId = request.user?.tenantId;

    // Não-UUID nem chega ao banco (o PostgreSQL recusaria o cast e viraria 500).
    if (typeof tenantId !== 'string' || !UUID.test(tenantId)) {
        return response.status(401).json({ error: 'Tenant não identificado' });
    }

    try {
        const tenant = await TenantProjection.findOne({ where: { id: tenantId, tenant_id: tenantId } });

        if (!tenant) {
            return response.status(401).json({ error: 'Tenant não encontrado' });
        }

        if (tenant.status !== 'ACTIVE') {
            return response.status(403).json({ error: 'Conta suspensa' });
        }

        request.tenantId = tenantId;
        next();
    } catch {
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
