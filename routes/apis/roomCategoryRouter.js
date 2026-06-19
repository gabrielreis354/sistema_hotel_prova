import { Router } from 'express';
import authMiddleware   from '../../middlewares/auth.middleware.js';
import tenantMiddleware from '../../middlewares/tenant.middleware.js';
import { requireRole }  from '../../middlewares/role.middleware.js';
import ListRoomCategoryController   from '../../app/Controllers/RoomCategoryApi/ListRoomCategoryController.js';
import GetRoomCategoryController    from '../../app/Controllers/RoomCategoryApi/GetRoomCategoryController.js';
import CreateRoomCategoryController from '../../app/Controllers/RoomCategoryApi/CreateRoomCategoryController.js';
import UpdateRoomCategoryController from '../../app/Controllers/RoomCategoryApi/UpdateRoomCategoryController.js';
import DeleteRoomCategoryController from '../../app/Controllers/RoomCategoryApi/DeleteRoomCategoryController.js';

export default (() => {
    const router = Router();

    router.use(authMiddleware, tenantMiddleware);

    router.get('/',       ListRoomCategoryController);
    router.get('/:id',    GetRoomCategoryController);
    router.post('/',      requireRole('ADMIN'), CreateRoomCategoryController);
    router.put('/:id',    requireRole('ADMIN'), UpdateRoomCategoryController);
    router.delete('/:id', requireRole('ADMIN'), DeleteRoomCategoryController);

    return router;
})();
