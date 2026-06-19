import { Router } from 'express';
import authMiddleware from '../../middlewares/auth.middleware.js';
import ListPaymentController   from '../../app/Controllers/PaymentApi/ListPaymentController.js';
import GetPaymentController    from '../../app/Controllers/PaymentApi/GetPaymentController.js';
import CreatePaymentController from '../../app/Controllers/PaymentApi/CreatePaymentController.js';
import UpdatePaymentController from '../../app/Controllers/PaymentApi/UpdatePaymentController.js';
import DeletePaymentController from '../../app/Controllers/PaymentApi/DeletePaymentController.js';

const paymentRouter = Router();

paymentRouter.use(authMiddleware);

paymentRouter.get('/',     ListPaymentController);
paymentRouter.get('/:id',  GetPaymentController);
paymentRouter.post('/',    CreatePaymentController);
paymentRouter.put('/:id',  UpdatePaymentController);
paymentRouter.delete('/:id', DeletePaymentController);

export default paymentRouter;
