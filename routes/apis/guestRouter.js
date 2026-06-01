import { Router } from 'express';
import authMiddleware   from '../../middlewares/auth.middleware.js';
import tenantMiddleware from '../../middlewares/tenant.middleware.js';
import { requireRole }  from '../../middlewares/role.middleware.js';
import ListGuestController   from '../../app/Controllers/GuestApi/ListGuestController.js';
import GetGuestController    from '../../app/Controllers/GuestApi/GetGuestController.js';
import CreateGuestController from '../../app/Controllers/GuestApi/CreateGuestController.js';
import UpdateGuestController from '../../app/Controllers/GuestApi/UpdateGuestController.js';
import DeleteGuestController from '../../app/Controllers/GuestApi/DeleteGuestController.js';

export default (() => {
    const router = Router();

    router.get('/',      authMiddleware, tenantMiddleware, ListGuestController);
    router.get('/:id',   authMiddleware, tenantMiddleware, GetGuestController);
    router.post('/',     authMiddleware, tenantMiddleware, CreateGuestController);
    router.put('/:id',   authMiddleware, tenantMiddleware, UpdateGuestController);
    router.delete('/:id', authMiddleware, tenantMiddleware, requireRole('ADMIN'), DeleteGuestController);

    return router;
})();
