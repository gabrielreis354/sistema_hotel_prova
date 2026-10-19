import { Router } from 'express';
import authMiddleware from '../../middlewares/auth.middleware.js';
import tenantMiddleware from '../../middlewares/tenant.middleware.js';

import ListAccountController from '../../app/Controllers/AccountApi/ListAccountController.js';
import GetAccountController from '../../app/Controllers/AccountApi/GetAccountController.js';
import CreateAccountController from '../../app/Controllers/AccountApi/CreateAccountController.js';

// Comanda (SPEC-04, T-04.1). Os três papéis entram aqui; o que o garçom alcança é
// decidido pela allowlist de app/utils/roles.js. Qual TIPO de conta ele pode abrir
// (D-8) depende do corpo, então fica no CreateAccountController.
export default (() => {
    const router = Router();

    router.use(authMiddleware, tenantMiddleware);

    router.get('/', ListAccountController);
    router.get('/:id', GetAccountController);
    router.post('/', CreateAccountController);

    return router;
})();
