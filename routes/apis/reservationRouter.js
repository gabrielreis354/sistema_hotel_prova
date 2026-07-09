import { Router } from 'express';
import authMiddleware from '../../middlewares/auth.middleware.js';
import tenantMiddleware from '../../middlewares/tenant.middleware.js';
import { requireRole } from '../../middlewares/role.middleware.js';

import ListReservationController from '../../app/Controllers/ReservationApi/ListReservationController.js';
import GetReservationController from '../../app/Controllers/ReservationApi/GetReservationController.js';
import CreateReservationController from '../../app/Controllers/ReservationApi/CreateReservationController.js';
import UpdateReservationController from '../../app/Controllers/ReservationApi/UpdateReservationController.js';
import DeleteReservationController from '../../app/Controllers/ReservationApi/DeleteReservationController.js';
import CheckInController from '../../app/Controllers/ReservationApi/CheckInController.js';
import CheckOutController from '../../app/Controllers/ReservationApi/CheckOutController.js';
import CancelReservationController from '../../app/Controllers/ReservationApi/CancelReservationController.js';
import AddRoomToReservationController from '../../app/Controllers/ReservationApi/AddRoomToReservationController.js';
import RemoveRoomFromReservationController from '../../app/Controllers/ReservationApi/RemoveRoomFromReservationController.js';
import GetBillController from '../../app/Controllers/ReservationApi/GetBillController.js';
import CreateConsumptionController from '../../app/Controllers/ConsumptionApi/CreateConsumptionController.js';
import ListConsumptionController from '../../app/Controllers/ConsumptionApi/ListConsumptionController.js';
import DeleteConsumptionController from '../../app/Controllers/ConsumptionApi/DeleteConsumptionController.js';

export default (() => {
    const router = Router();

    router.use(authMiddleware, tenantMiddleware);

    router.get('/', ListReservationController);
    router.get('/:id', GetReservationController);
    router.post('/', CreateReservationController);
    router.put('/:id', UpdateReservationController);
    router.delete('/:id', requireRole('ADMIN'), DeleteReservationController);

    router.put('/:id/check-in', CheckInController);
    router.put('/:id/check-out', CheckOutController);
    router.put('/:id/cancel', CancelReservationController);

    router.post('/:id/rooms', AddRoomToReservationController);
    router.delete('/:id/rooms/:roomId', RemoveRoomFromReservationController);

    // Módulo Financeiro — fechamento de conta e consumos extras
    router.get('/:id/bill', GetBillController);
    router.get('/:id/consumptions', ListConsumptionController);
    router.post('/:id/consumptions', CreateConsumptionController);
    router.delete('/:id/consumptions/:consumptionId', DeleteConsumptionController);

    return router;
})();