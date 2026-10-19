import { Router } from 'express';
import authMiddleware from '../../middlewares/auth.middleware.js';
import tenantMiddleware from '../../middlewares/tenant.middleware.js';

import ListAccountController from '../../app/Controllers/AccountApi/ListAccountController.js';
import GetAccountController from '../../app/Controllers/AccountApi/GetAccountController.js';
import CreateAccountController from '../../app/Controllers/AccountApi/CreateAccountController.js';
import CreateAccountItemController from '../../app/Controllers/AccountApi/CreateAccountItemController.js';

// Comanda (SPEC-04, T-04.1). Os três papéis entram aqui; o que o garçom alcança é
// decidido pela allowlist de app/utils/roles.js. O que depende do corpo — qual tipo de
// conta abrir, lançar cortesia (D-8) — fica nos controllers.
export default (() => {
    const router = Router();

    router.use(authMiddleware, tenantMiddleware);

    router.get('/', ListAccountController);
    router.get('/:id', GetAccountController);
    router.post('/', CreateAccountController);
    router.post('/:id/items', CreateAccountItemController);

    return router;
})();
