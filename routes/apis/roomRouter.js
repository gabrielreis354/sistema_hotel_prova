import { Router } from 'express';
import authMiddleware  from '../../middlewares/auth.middleware.js';
import { requireRole } from '../../middlewares/role.middleware.js';
import ListRoomController   from '../../app/Controllers/RoomApi/ListRoomController.js';
import GetRoomController    from '../../app/Controllers/RoomApi/GetRoomController.js';
import CreateRoomController from '../../app/Controllers/RoomApi/CreateRoomController.js';
import UpdateRoomController from '../../app/Controllers/RoomApi/UpdateRoomController.js';
import DeleteRoomController from '../../app/Controllers/RoomApi/DeleteRoomController.js';

export default (() => {
    const router = Router();

    router.get('/',       authMiddleware, ListRoomController);
    router.get('/:id',    authMiddleware, GetRoomController);
    router.post('/',      authMiddleware, requireRole('ADMIN'), CreateRoomController);
    router.put('/:id',    authMiddleware, requireRole('ADMIN'), UpdateRoomController);
    router.delete('/:id', authMiddleware, requireRole('ADMIN'), DeleteRoomController);

    return router;
})();
