import { Router } from 'express';
import authMiddleware from '../../middlewares/auth.middleware.js';
import tenantMiddleware from '../../middlewares/tenant.middleware.js';
import { requireRole } from '../../middlewares/role.middleware.js';

import ListUserController from '../../app/Controllers/UserApi/ListUserController.js';
import GetUserController from '../../app/Controllers/UserApi/GetUserController.js';
import CreateUserController from '../../app/Controllers/UserApi/CreateUserController.js';
import UpdateUserController from '../../app/Controllers/UserApi/UpdateUserController.js';
import DeleteUserController from '../../app/Controllers/UserApi/DeleteUserController.js';
import notFoundUnlessUuid from '../../app/utils/notFoundUnlessUuid.js';

export default (() => {
    const router = Router();

    router.use(authMiddleware, tenantMiddleware);

    // :id que não é UUID responde 404, não 500 (repasse de 15/11; mesmo molde do reservationRouter).
    router.param('id', notFoundUnlessUuid('Usuário não encontrado'));

    router.get('/', requireRole('ADMIN'), ListUserController);
    router.get('/:id', requireRole('ADMIN'), GetUserController);
    router.post('/', requireRole('ADMIN'), CreateUserController);
    router.put('/:id', requireRole('ADMIN'), UpdateUserController);
    router.delete('/:id', requireRole('ADMIN'), DeleteUserController);

    return router;
})();