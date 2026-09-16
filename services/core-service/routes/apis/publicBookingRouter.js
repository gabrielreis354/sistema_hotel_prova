import { Router } from 'express';

import GetHotelController from '../../app/Controllers/PublicBookingApi/GetHotelController.js';
import GetAvailabilityController from '../../app/Controllers/PublicBookingApi/GetAvailabilityController.js';
import CreateBookingController from '../../app/Controllers/PublicBookingApi/CreateBookingController.js';
import GetBookingStatusController from '../../app/Controllers/PublicBookingApi/GetBookingStatusController.js';

/**
 * Router PÚBLICO do motor de reserva direta.
 * Montado em /public/:subdomain — SEM authMiddleware (acesso do hóspede, sem login).
 * O isolamento multi-tenant é garantido por resolveTenantBySubdomain em cada controller.
 *
 * mergeParams: true → expõe o :subdomain definido no path pai aos controllers.
 */
export default (() => {
    const router = Router({ mergeParams: true });

    router.get('/hotel', GetHotelController);
    router.get('/availability', GetAvailabilityController);
    router.post('/bookings', CreateBookingController);
    router.get('/bookings/:id/status', GetBookingStatusController);

    return router;
})();
