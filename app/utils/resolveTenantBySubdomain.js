import TenantModel from '../Models/TenantModel.js';

/**
 * Resolve o hotel (tenant) a partir do subdomínio nas rotas públicas.
 *
 * Centraliza a tradução subdomínio → tenant e as validações de acesso público,
 * garantindo o isolamento multi-tenant: tudo que vem depois opera só neste tenant.
 *
 * @param {string} subdomain
 * @returns {Promise<{ tenant: object|null, error: { status: number, message: string }|null }>}
 */
export async function resolveTenantBySubdomain(subdomain) {
    if (!subdomain) {
        return { tenant: null, error: { status: 400, message: 'Subdomínio obrigatório' } };
    }

    const tenant = await TenantModel.findOne({ where: { subdomain } });

    if (!tenant || tenant.status !== 'ACTIVE') {
        return { tenant: null, error: { status: 404, message: 'Hotel não encontrado' } };
    }

    if (!tenant.booking_enabled) {
        return { tenant: null, error: { status: 403, message: 'Reservas online indisponíveis para este hotel' } };
    }

    return { tenant, error: null };
}
