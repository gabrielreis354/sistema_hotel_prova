import { Router } from 'express';
import authMiddleware   from '../../middlewares/auth.middleware.js';
import tenantMiddleware from '../../middlewares/tenant.middleware.js';
import { requireRole }  from '../../middlewares/role.middleware.js';
import ListUserController   from '../../app/Controllers/UserApi/ListUserController.js';
import GetUserController    from '../../app/Controllers/UserApi/GetUserController.js';
import CreateUserController from '../../app/Controllers/UserApi/CreateUserController.js';
import UpdateUserController from '../../app/Controllers/UserApi/UpdateUserController.js';
import DeleteUserController from '../../app/Controllers/UserApi/DeleteUserController.js';

export default (() => {
    const router = Router();

    router.get('/',      authMiddleware, tenantMiddleware, requireRole('ADMIN'), ListUserController);
    router.get('/:id',   authMiddleware, tenantMiddleware, requireRole('ADMIN'), GetUserController);
    router.post('/',     authMiddleware, tenantMiddleware, requireRole('ADMIN'), CreateUserController);
    router.put('/:id',   authMiddleware, tenantMiddleware, requireRole('ADMIN'), UpdateUserController);
    router.delete('/:id', authMiddleware, tenantMiddleware, requireRole('ADMIN'), DeleteUserController);

    return router;
})();
