import { Router } from 'express';
import authMiddleware from '../middlewares/auth.middleware.js';
import tenantMiddleware from '../middlewares/tenant.middleware.js';
import { requireRole } from '../middlewares/role.middleware.js';
import GetProjectionStatusController from '../app/Controllers/StatusApi/GetProjectionStatusController.js';

const router = Router();

// Saúde do processo, sem autenticação — para o healthcheck do contêiner e as probes do k8s.
router.get('/health', (request, response) => {
    return response.json({ status: 'OK', timestamp: new Date().toISOString(), service: 'Gesway analytics-service' });
});

// Indicadores são dado gerencial — só ADMIN e RECEPTIONIST, como no core (analyticsRouter.js).
// As 7 consultas entram neste router na H.3 (CA-01.4.k).
const analyticsRouter = Router();
analyticsRouter.use(authMiddleware, tenantMiddleware, requireRole('ADMIN', 'RECEPTIONIST'));
analyticsRouter.get('/health', GetProjectionStatusController);

router.use('/analytics', analyticsRouter);

export default router;
