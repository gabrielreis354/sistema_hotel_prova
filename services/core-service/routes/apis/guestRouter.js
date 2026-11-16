import { Router } from 'express';
import authMiddleware   from '../../middlewares/auth.middleware.js';
import tenantMiddleware from '../../middlewares/tenant.middleware.js';
import { requireRole }  from '../../middlewares/role.middleware.js';
import ListGuestController   from '../../app/Controllers/GuestApi/ListGuestController.js';
import GetGuestController    from '../../app/Controllers/GuestApi/GetGuestController.js';
import CreateGuestController from '../../app/Controllers/GuestApi/CreateGuestController.js';
import UpdateGuestController from '../../app/Controllers/GuestApi/UpdateGuestController.js';
import DeleteGuestController from '../../app/Controllers/GuestApi/DeleteGuestController.js';
import notFoundUnlessUuid from '../../app/utils/notFoundUnlessUuid.js';

export default (() => {
    const router = Router();

    router.use(authMiddleware, tenantMiddleware);

    // :id que não é UUID responde 404, não 500 (repasse de 15/11; mesmo molde do reservationRouter).
    router.param('id', notFoundUnlessUuid('Hóspede não encontrado'));

    router.get('/',       ListGuestController);
    router.get('/:id',    GetGuestController);
    router.post('/',      CreateGuestController);
    router.put('/:id',    UpdateGuestController);
    router.delete('/:id', requireRole('ADMIN'), DeleteGuestController);

    return router;
})();
