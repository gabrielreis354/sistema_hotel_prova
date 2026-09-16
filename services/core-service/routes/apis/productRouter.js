import { Router } from 'express';
import authMiddleware from '../../middlewares/auth.middleware.js';
import tenantMiddleware from '../../middlewares/tenant.middleware.js';
import { requireRole } from '../../middlewares/role.middleware.js';

import ListProductController from '../../app/Controllers/ProductApi/ListProductController.js';
import GetProductController from '../../app/Controllers/ProductApi/GetProductController.js';
import CreateProductController from '../../app/Controllers/ProductApi/CreateProductController.js';
import UpdateProductController from '../../app/Controllers/ProductApi/UpdateProductController.js';
import DeleteProductController from '../../app/Controllers/ProductApi/DeleteProductController.js';

export default (() => {
    const router = Router();

    router.use(authMiddleware, tenantMiddleware);

    // Leitura liberada a todos os papéis autenticados: o WAITER precisa do
    // cardápio para lançar consumo. Escrita é configuração — só ADMIN,
    // mesmo critério de roomCategoryRouter.
    router.get('/', ListProductController);
    router.get('/:id', GetProductController);
    router.post('/', requireRole('ADMIN'), CreateProductController);
    router.put('/:id', requireRole('ADMIN'), UpdateProductController);
    router.delete('/:id', requireRole('ADMIN'), DeleteProductController);

    return router;
})();
