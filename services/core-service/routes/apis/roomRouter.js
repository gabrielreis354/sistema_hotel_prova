import { Router } from 'express';
import authMiddleware from '../../middlewares/auth.middleware.js';
import tenantMiddleware from '../../middlewares/tenant.middleware.js';
import { requireRole } from '../../middlewares/role.middleware.js';

import ListRoomController from '../../app/Controllers/RoomApi/ListRoomController.js';
import ListAvailableRoomsController from '../../app/Controllers/RoomApi/ListAvailableRoomsController.js';
import GetRoomController from '../../app/Controllers/RoomApi/GetRoomController.js';
import CreateRoomController from '../../app/Controllers/RoomApi/CreateRoomController.js';
import UpdateRoomController from '../../app/Controllers/RoomApi/UpdateRoomController.js';
import DeleteRoomController from '../../app/Controllers/RoomApi/DeleteRoomController.js';

export default (() => {
    const router = Router();

    router.use(authMiddleware, tenantMiddleware);

    // Gestão de quartos é da recepção/admin — o garçom (WAITER) não entra aqui.
    // Rota /available antes de /:id para não ser capturada como parâmetro.
    router.get('/available', requireRole('ADMIN', 'RECEPTIONIST'), ListAvailableRoomsController);

    router.get('/', requireRole('ADMIN', 'RECEPTIONIST'), ListRoomController);
    router.get('/:id', requireRole('ADMIN', 'RECEPTIONIST'), GetRoomController);
    router.post('/', requireRole('ADMIN'), CreateRoomController);
    router.put('/:id', requireRole('ADMIN'), UpdateRoomController);
    router.delete('/:id', requireRole('ADMIN'), DeleteRoomController);

    return router;
})();