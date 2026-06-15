import { Router } from 'express';
import authMiddleware  from '../../middlewares/auth.middleware.js';
import { requireRole } from '../../middlewares/role.middleware.js';
import ListRoomCategoryController   from '../../app/Controllers/RoomCategoryApi/ListRoomCategoryController.js';
import GetRoomCategoryController    from '../../app/Controllers/RoomCategoryApi/GetRoomCategoryController.js';
import CreateRoomCategoryController from '../../app/Controllers/RoomCategoryApi/CreateRoomCategoryController.js';
import UpdateRoomCategoryController from '../../app/Controllers/RoomCategoryApi/UpdateRoomCategoryController.js';
import DeleteRoomCategoryController from '../../app/Controllers/RoomCategoryApi/DeleteRoomCategoryController.js';

export default (() => {
    const router = Router();

    router.get('/',       authMiddleware, ListRoomCategoryController);
    router.get('/:id',    authMiddleware, GetRoomCategoryController);
    router.post('/',      authMiddleware, requireRole('ADMIN'), CreateRoomCategoryController);
    router.put('/:id',    authMiddleware, requireRole('ADMIN'), UpdateRoomCategoryController);
    router.delete('/:id', authMiddleware, requireRole('ADMIN'), DeleteRoomCategoryController);

    return router;
})();
