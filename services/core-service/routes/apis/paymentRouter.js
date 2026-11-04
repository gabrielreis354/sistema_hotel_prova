import { Router } from 'express';
import authMiddleware from '../../middlewares/auth.middleware.js';
import tenantMiddleware from '../../middlewares/tenant.middleware.js';
import { requireRole } from '../../middlewares/role.middleware.js';

import ListPaymentController from '../../app/Controllers/PaymentApi/ListPaymentController.js';
import GetPaymentController from '../../app/Controllers/PaymentApi/GetPaymentController.js';
import CreatePaymentController from '../../app/Controllers/PaymentApi/CreatePaymentController.js';
import UpdatePaymentController from '../../app/Controllers/PaymentApi/UpdatePaymentController.js';
import VoidPaymentController from '../../app/Controllers/PaymentApi/VoidPaymentController.js';

const paymentRouter = Router();

paymentRouter.use(authMiddleware, tenantMiddleware);

/**
 * DELETE /payments/:id não existe mais (T-06.13, CA-06.13.a): lançamento financeiro não se
 * apaga — se estorna. 405 com o caminho certo, para um cliente antigo não falhar em silêncio.
 * Atrás do requireRole('ADMIN'), como o void: quem não pode estornar recebe 403.
 */
function paymentDeleteNotAllowed(request, response) {
    return response.status(405).set('Allow', 'GET, PUT').json({
        error: `Pagamento não se exclui: estorne com POST /payments/${request.params.id}/void e { "reason": "..." }.`
    });
}

paymentRouter.get('/', ListPaymentController);
paymentRouter.get('/:id', GetPaymentController);
paymentRouter.post('/', CreatePaymentController);
// Alterar e anular lançamento financeiro é decisão de gerência (CA-06.13.d, repasse de 19/10).
paymentRouter.post('/:id/void', requireRole('ADMIN'), VoidPaymentController);
paymentRouter.put('/:id', requireRole('ADMIN'), UpdatePaymentController);
paymentRouter.delete('/:id', requireRole('ADMIN'), paymentDeleteNotAllowed);

export default paymentRouter;
