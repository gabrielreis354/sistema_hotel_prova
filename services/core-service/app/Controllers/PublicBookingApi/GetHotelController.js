import { resolveTenantBySubdomain } from '../../utils/resolveTenantBySubdomain.js';

/**
 * GET /public/:subdomain/hotel
 * Dados públicos do hotel para o cabeçalho da página de reservas.
 * Não expõe nada sensível — apenas nome, subdomínio e % de sinal cobrado.
 */
export default async function GetHotelController(request, response) {
    try {
        const { subdomain } = request.params;
        const { tenant, error } = await resolveTenantBySubdomain(subdomain);
        if (error) return response.status(error.status).json({ error: error.message });

        return response.status(200).json({
            name: tenant.name,
            subdomain: tenant.subdomain,
            deposit_percent: tenant.deposit_percent
        });
    } catch (error) {
        console.error('GetHotelController:', error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
