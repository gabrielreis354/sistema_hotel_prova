import { Router } from 'express';
import authMiddleware  from '../../middlewares/auth.middleware.js';
import { requireRole } from '../../middlewares/role.middleware.js';
import ListGuestController   from '../../app/Controllers/GuestApi/ListGuestController.js';
import GetGuestController    from '../../app/Controllers/GuestApi/GetGuestController.js';
import CreateGuestController from '../../app/Controllers/GuestApi/CreateGuestController.js';
import UpdateGuestController from '../../app/Controllers/GuestApi/UpdateGuestController.js';
import DeleteGuestController from '../../app/Controllers/GuestApi/DeleteGuestController.js';

export default (() => {
    const router = Router();

    router.get('/',       authMiddleware, ListGuestController);
    router.get('/:id',    authMiddleware, GetGuestController);
    router.post('/',      authMiddleware, CreateGuestController);
    router.put('/:id',    authMiddleware, UpdateGuestController);
    router.delete('/:id', authMiddleware, requireRole('ADMIN'), DeleteGuestController);

    return router;
})();
