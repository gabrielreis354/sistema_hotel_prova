import { Router } from 'express';
import authMiddleware from '../../middlewares/auth.middleware.js';
import tenantMiddleware from '../../middlewares/tenant.middleware.js';
import { requireRole } from '../../middlewares/role.middleware.js';
import GetRevenueController           from '../../app/Controllers/AnalyticsApi/GetRevenueController.js';
import GetOccupancyController         from '../../app/Controllers/AnalyticsApi/GetOccupancyController.js';
import GetAlertsController            from '../../app/Controllers/AnalyticsApi/GetAlertsController.js';
import GetSeasonalityController       from '../../app/Controllers/AnalyticsApi/GetSeasonalityController.js';
import GetRevenueByCategoryController from '../../app/Controllers/AnalyticsApi/GetRevenueByCategoryController.js';
import GetPaymentMixController        from '../../app/Controllers/AnalyticsApi/GetPaymentMixController.js';
import GetTopGuestsController         from '../../app/Controllers/AnalyticsApi/GetTopGuestsController.js';

const analyticsRouter = Router();

// Analytics é dado gerencial — restrito a recepção/admin. Garçom (WAITER) não vê.
analyticsRouter.use(authMiddleware, tenantMiddleware, requireRole('ADMIN', 'RECEPTIONIST'));

analyticsRouter.get('/revenue',              GetRevenueController);
analyticsRouter.get('/occupancy',            GetOccupancyController);
analyticsRouter.get('/alerts',               GetAlertsController);
analyticsRouter.get('/seasonality',          GetSeasonalityController);
analyticsRouter.get('/revenue-by-category',  GetRevenueByCategoryController);
analyticsRouter.get('/payment-mix',          GetPaymentMixController);
analyticsRouter.get('/top-guests',           GetTopGuestsController);

export default analyticsRouter;
