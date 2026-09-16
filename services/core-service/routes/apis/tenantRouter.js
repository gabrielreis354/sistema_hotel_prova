import { Router } from 'express';
import authMiddleware from '../../middlewares/auth.middleware.js';
import tenantMiddleware from '../../middlewares/tenant.middleware.js';
import { requireRole } from '../../middlewares/role.middleware.js';

import GetTenantController from '../../app/Controllers/TenantApi/GetTenantController.js';
import UpdateTenantController from '../../app/Controllers/TenantApi/UpdateTenantController.js';

// Auto-gestão do hotel (tenant do JWT). /me em vez de /:id: o admin só administra
// o próprio hotel — impossível referenciar outro tenant, sem risco de IDOR.
export default (() => {
    const router = Router();

    router.use(authMiddleware, tenantMiddleware);

    router.get('/me', GetTenantController);
    router.put('/me', requireRole('ADMIN'), UpdateTenantController);

    return router;
})();
