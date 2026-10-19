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

    // attributes explícito: este resolver serve só as rotas PÚBLICAS, sem autenticação.
    // Sem ele viria o tenant inteiro, incluindo legal_id (CNPJ do hotel) — dado que
    // nenhum consumidor público usa. A lista cobre os campos realmente lidos: id,
    // name, subdomain e deposit_percent pelos controllers; status e booking_enabled
    // pelos guards abaixo.
    const tenant = await TenantModel.findOne({
        where: { subdomain },
        attributes: ['id', 'name', 'subdomain', 'status', 'booking_enabled', 'deposit_percent']
    });

    if (!tenant || tenant.status !== 'ACTIVE') {
        return { tenant: null, error: { status: 404, message: 'Hotel não encontrado' } };
    }

    if (!tenant.booking_enabled) {
        return { tenant: null, error: { status: 403, message: 'Reservas online indisponíveis para este hotel' } };
    }

    return { tenant, error: null };
}
