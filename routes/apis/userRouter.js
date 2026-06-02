import { Router } from 'express';
import authMiddleware  from '../../middlewares/auth.middleware.js';
import { requireRole } from '../../middlewares/role.middleware.js';
import ListUserController   from '../../app/Controllers/UserApi/ListUserController.js';
import GetUserController    from '../../app/Controllers/UserApi/GetUserController.js';
import CreateUserController from '../../app/Controllers/UserApi/CreateUserController.js';
import UpdateUserController from '../../app/Controllers/UserApi/UpdateUserController.js';
import DeleteUserController from '../../app/Controllers/UserApi/DeleteUserController.js';

export default (() => {
    const router = Router();

    router.get('/',       authMiddleware, requireRole('ADMIN'), ListUserController);
    router.get('/:id',    authMiddleware, requireRole('ADMIN'), GetUserController);
    router.post('/',      authMiddleware, requireRole('ADMIN'), CreateUserController);
    router.put('/:id',    authMiddleware, requireRole('ADMIN'), UpdateUserController);
    router.delete('/:id', authMiddleware, requireRole('ADMIN'), DeleteUserController);

    return router;
})();
