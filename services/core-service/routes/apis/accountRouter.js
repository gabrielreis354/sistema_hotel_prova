import { Router } from 'express';
import authMiddleware from '../../middlewares/auth.middleware.js';
import tenantMiddleware from '../../middlewares/tenant.middleware.js';
import { requireRole } from '../../middlewares/role.middleware.js';

import ListAccountController from '../../app/Controllers/AccountApi/ListAccountController.js';
import GetAccountController from '../../app/Controllers/AccountApi/GetAccountController.js';
import CreateAccountController from '../../app/Controllers/AccountApi/CreateAccountController.js';
import CreateAccountItemController from '../../app/Controllers/AccountApi/CreateAccountItemController.js';
import DeleteAccountItemController from '../../app/Controllers/AccountApi/DeleteAccountItemController.js';
import GetAccountBillController from '../../app/Controllers/AccountApi/GetAccountBillController.js';
import CloseAccountController from '../../app/Controllers/AccountApi/CloseAccountController.js';

// Comanda (SPEC-04, T-04.1). Os três papéis entram aqui; o que o garçom alcança é
// decidido pela allowlist de app/utils/roles.js. O que depende do corpo — qual tipo de
// conta abrir, lançar cortesia (D-8) — fica nos controllers.
export default (() => {
    const router = Router();

    router.use(authMiddleware, tenantMiddleware);

    router.get('/', ListAccountController);
    router.get('/:id', GetAccountController);
    // Bill é da recepção e da gerência (T-04.3). O garçom já é barrado pela allowlist; o
    // requireRole repete a regra aqui para ela não depender só de um arquivo distante.
    router.get('/:id/bill', requireRole('ADMIN', 'RECEPTIONIST'), GetAccountBillController);
    router.put('/:id/close', requireRole('ADMIN', 'RECEPTIONIST'), CloseAccountController);
    router.post('/', CreateAccountController);
    router.post('/:id/items', CreateAccountItemController);
    // Excluir lançamento é ato financeiro: só ADMIN (D-7, D-8).
    router.delete('/:id/items/:itemId', requireRole('ADMIN'), DeleteAccountItemController);

    return router;
})();
