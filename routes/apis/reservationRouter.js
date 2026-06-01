import { Router } from 'express';
import authMiddleware   from '../../middlewares/auth.middleware.js';
import tenantMiddleware from '../../middlewares/tenant.middleware.js';
import { requireRole }  from '../../middlewares/role.middleware.js';
import ListReservationController   from '../../app/Controllers/ReservationApi/ListReservationController.js';
import GetReservationController    from '../../app/Controllers/ReservationApi/GetReservationController.js';
import CreateReservationController from '../../app/Controllers/ReservationApi/CreateReservationController.js';
import UpdateReservationController from '../../app/Controllers/ReservationApi/UpdateReservationController.js';
import DeleteReservationController from '../../app/Controllers/ReservationApi/DeleteReservationController.js';
import CheckInController  from '../../app/Controllers/ReservationApi/CheckInController.js';
import CheckOutController from '../../app/Controllers/ReservationApi/CheckOutController.js';

export default (() => {
    const router = Router();

    router.get('/',      authMiddleware, tenantMiddleware, ListReservationController);
    router.get('/:id',   authMiddleware, tenantMiddleware, GetReservationController);
    router.post('/',     authMiddleware, tenantMiddleware, CreateReservationController);
    router.put('/:id',   authMiddleware, tenantMiddleware, UpdateReservationController);
    router.delete('/:id', authMiddleware, tenantMiddleware, requireRole('ADMIN'), DeleteReservationController);

    router.put('/:id/check-in',  authMiddleware, tenantMiddleware, CheckInController);
    router.put('/:id/check-out', authMiddleware, tenantMiddleware, CheckOutController);

    return router;
})();
