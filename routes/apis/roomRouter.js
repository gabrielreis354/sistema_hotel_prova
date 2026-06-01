import { Router } from 'express';
import authMiddleware   from '../../middlewares/auth.middleware.js';
import tenantMiddleware from '../../middlewares/tenant.middleware.js';
import { requireRole }  from '../../middlewares/role.middleware.js';
import ListRoomController   from '../../app/Controllers/RoomApi/ListRoomController.js';
import GetRoomController    from '../../app/Controllers/RoomApi/GetRoomController.js';
import CreateRoomController from '../../app/Controllers/RoomApi/CreateRoomController.js';
import UpdateRoomController from '../../app/Controllers/RoomApi/UpdateRoomController.js';
import DeleteRoomController from '../../app/Controllers/RoomApi/DeleteRoomController.js';

export default (() => {
    const router = Router();

    router.get('/',      authMiddleware, tenantMiddleware, ListRoomController);
    router.get('/:id',   authMiddleware, tenantMiddleware, GetRoomController);
    router.post('/',     authMiddleware, tenantMiddleware, requireRole('ADMIN'), CreateRoomController);
    router.put('/:id',   authMiddleware, tenantMiddleware, requireRole('ADMIN'), UpdateRoomController);
    router.delete('/:id', authMiddleware, tenantMiddleware, requireRole('ADMIN'), DeleteRoomController);

    return router;
})();
