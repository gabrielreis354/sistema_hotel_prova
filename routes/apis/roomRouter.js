import { Router } from 'express';
import authMiddleware  from '../../middlewares/auth.middleware.js';
import { requireRole } from '../../middlewares/role.middleware.js';
import ListRoomController          from '../../app/Controllers/RoomApi/ListRoomController.js';
import ListAvailableRoomsController from '../../app/Controllers/RoomApi/ListAvailableRoomsController.js';
import GetRoomController           from '../../app/Controllers/RoomApi/GetRoomController.js';
import CreateRoomController        from '../../app/Controllers/RoomApi/CreateRoomController.js';
import UpdateRoomController        from '../../app/Controllers/RoomApi/UpdateRoomController.js';
import DeleteRoomController        from '../../app/Controllers/RoomApi/DeleteRoomController.js';

export default (() => {
    const router = Router();

    // Rota /available antes de /:id para não ser capturada como parâmetro
    router.get('/available', authMiddleware, ListAvailableRoomsController);

    router.get('/',       authMiddleware, ListRoomController);
    router.get('/:id',    authMiddleware, GetRoomController);
    router.post('/',      authMiddleware, requireRole('ADMIN'), CreateRoomController);
    router.put('/:id',    authMiddleware, requireRole('ADMIN'), UpdateRoomController);
    router.delete('/:id', authMiddleware, requireRole('ADMIN'), DeleteRoomController);

    return router;
})();
