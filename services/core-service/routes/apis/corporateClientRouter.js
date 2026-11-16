import { Router } from 'express';
import authMiddleware from '../../middlewares/auth.middleware.js';
import tenantMiddleware from '../../middlewares/tenant.middleware.js';
import { requireRole } from '../../middlewares/role.middleware.js';
import CreateCorporateClientController from '../../app/Controllers/CorporateClientApi/CreateCorporateClientController.js';
import ListCorporateClientController from '../../app/Controllers/CorporateClientApi/ListCorporateClientController.js';
import GetCorporateClientController from '../../app/Controllers/CorporateClientApi/GetCorporateClientController.js';
import UpdateCorporateClientController from '../../app/Controllers/CorporateClientApi/UpdateCorporateClientController.js';
import DeleteCorporateClientController from '../../app/Controllers/CorporateClientApi/DeleteCorporateClientController.js';
import notFoundUnlessUuid from '../../app/utils/notFoundUnlessUuid.js';

const router = Router();
router.use(authMiddleware, tenantMiddleware);
// :id que não é UUID responde 404, não 500 (repasse de 15/11; mesmo molde do reservationRouter).
router.param('id', notFoundUnlessUuid('Cliente não encontrado'));
router.get('/', ListCorporateClientController);
router.get('/:id', GetCorporateClientController);
router.post('/', CreateCorporateClientController);
router.put('/:id', UpdateCorporateClientController);
router.delete('/:id', requireRole('ADMIN'), DeleteCorporateClientController);
export default router;
