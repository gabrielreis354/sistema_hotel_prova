import { resolveTenantBySubdomain } from '../../utils/resolveTenantBySubdomain.js';
import { getAvailableCategories } from '../../utils/getAvailableCategories.js';
import { logError } from '../../utils/logError.js';
import { publicStayDatesError } from '../../utils/publicStayDates.js';

/**
 * GET /public/:subdomain/availability?check_in=&check_out=&guests=
 * Lista as categorias disponíveis no período, com preço da estadia.
 */
export default async function GetAvailabilityController(request, response) {
    try {
        const { subdomain } = request.params;
        const { check_in, check_out, guests } = request.query;

        const { tenant, error } = await resolveTenantBySubdomain(subdomain);
        if (error) return response.status(error.status).json({ error: error.message });

        const datesError = publicStayDatesError(check_in, check_out);
        if (datesError) return response.status(400).json({ error: datesError });

        const numGuests = guests ? parseInt(guests, 10) : 1;

        const { nights, categories } = await getAvailableCategories({
            tenantId: tenant.id,
            checkIn: check_in,
            checkOut: check_out,
            guests: numGuests
        });

        return response.status(200).json({
            hotel: tenant.name,
            check_in,
            check_out,
            nights,
            guests: numGuests,
            deposit_percent: tenant.deposit_percent,
            categories
        });
    } catch (error) {
        logError('GetAvailabilityController', error);
        return response.status(500).json({ error: 'Erro interno do servidor' });
    }
}
