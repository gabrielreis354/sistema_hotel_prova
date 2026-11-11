import { Router } from 'express';
import authMiddleware from '../../middlewares/auth.middleware.js';
import tenantMiddleware from '../../middlewares/tenant.middleware.js';
import { requireRole } from '../../middlewares/role.middleware.js';
import GetInternalConsumptionController from '../../app/Controllers/AnalyticsApi/GetInternalConsumptionController.js';

// Os 7 indicadores (revenue, occupancy, alerts, seasonality, revenue-by-category, payment-mix,
// top-guests) saíram do core na T-01.4/H.3 (CA-01.4.o): o analytics-service os responde a partir das
// projeções e o nginx roteia /analytics/ para ele. Aqui, essas rotas respondem 404.
//
// Fica só o consumo interno (T-04.7): ele lê accounts e account_items, que não geram evento no
// catálogo — depende da decisão L-1 (evento novo ou manter no core no MVP). O nginx manda este
// caminho específico para o core, antes da regra geral de /analytics/.
const analyticsRouter = Router();

// Cortesia, refeição de funcionário e perda: decisão de gestão, só ADMIN (CA-04.7.c).
analyticsRouter.get('/internal-consumption',
    authMiddleware, tenantMiddleware, requireRole('ADMIN'), GetInternalConsumptionController);

export default analyticsRouter;
