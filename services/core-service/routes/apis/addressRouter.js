import { Router } from 'express';
import authMiddleware   from '../../middlewares/auth.middleware.js';
import tenantMiddleware from '../../middlewares/tenant.middleware.js';
import GetAddressController from '../../app/Controllers/AddressApi/GetAddressController.js';

export default (() => {
    const router = Router();

    router.use(authMiddleware, tenantMiddleware);

    router.get('/:cep', GetAddressController);

    return router;
})();
