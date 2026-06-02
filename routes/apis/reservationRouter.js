import { Router } from 'express';
import authMiddleware  from '../../middlewares/auth.middleware.js';
import { requireRole } from '../../middlewares/role.middleware.js';
import ListReservationController   from '../../app/Controllers/ReservationApi/ListReservationController.js';
import GetReservationController    from '../../app/Controllers/ReservationApi/GetReservationController.js';
import CreateReservationController from '../../app/Controllers/ReservationApi/CreateReservationController.js';
import UpdateReservationController from '../../app/Controllers/ReservationApi/UpdateReservationController.js';
import DeleteReservationController from '../../app/Controllers/ReservationApi/DeleteReservationController.js';
import CheckInController  from '../../app/Controllers/ReservationApi/CheckInController.js';
import CheckOutController from '../../app/Controllers/ReservationApi/CheckOutController.js';
import AddRoomToReservationController      from '../../app/Controllers/ReservationApi/AddRoomToReservationController.js';
import RemoveRoomFromReservationController from '../../app/Controllers/ReservationApi/RemoveRoomFromReservationController.js';

export default (() => {
    const router = Router();

    router.get('/',       authMiddleware, ListReservationController);
    router.get('/:id',    authMiddleware, GetReservationController);
    router.post('/',      authMiddleware, CreateReservationController);
    router.put('/:id',    authMiddleware, UpdateReservationController);
    router.delete('/:id', authMiddleware, requireRole('ADMIN'), DeleteReservationController);

    router.put('/:id/check-in',  authMiddleware, CheckInController);
    router.put('/:id/check-out', authMiddleware, CheckOutController);

    // Gerenciar quartos da reserva (N:N — tabela pivô reservation_rooms)
    router.post('/:id/rooms',           authMiddleware, AddRoomToReservationController);
    router.delete('/:id/rooms/:roomId', authMiddleware, RemoveRoomFromReservationController);

    return router;
})();
