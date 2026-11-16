import { Router } from 'express';
import authMiddleware from '../../middlewares/auth.middleware.js';
import tenantMiddleware from '../../middlewares/tenant.middleware.js';
import { requireRole } from '../../middlewares/role.middleware.js';

import ListRoomCategoryController from '../../app/Controllers/RoomCategoryApi/ListRoomCategoryController.js';
import GetRoomCategoryController from '../../app/Controllers/RoomCategoryApi/GetRoomCategoryController.js';
import CreateRoomCategoryController from '../../app/Controllers/RoomCategoryApi/CreateRoomCategoryController.js';
import UpdateRoomCategoryController from '../../app/Controllers/RoomCategoryApi/UpdateRoomCategoryController.js';
import DeleteRoomCategoryController from '../../app/Controllers/RoomCategoryApi/DeleteRoomCategoryController.js';
import notFoundUnlessUuid from '../../app/utils/notFoundUnlessUuid.js';

export default (() => {
    const router = Router();

    router.use(authMiddleware, tenantMiddleware);

    // :id que não é UUID responde 404, não 500 (repasse de 15/11; mesmo molde do reservationRouter).
    router.param('id', notFoundUnlessUuid('Categoria não encontrada'));

    router.get('/', ListRoomCategoryController);
    router.get('/:id', GetRoomCategoryController);
    router.post('/', requireRole('ADMIN'), CreateRoomCategoryController);
    router.put('/:id', requireRole('ADMIN'), UpdateRoomCategoryController);
    router.delete('/:id', requireRole('ADMIN'), DeleteRoomCategoryController);

    return router;
})();