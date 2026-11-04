import { Router } from 'express';
import sequelize from '../database/connections/sequelize.js';
import authMiddleware from '../middlewares/auth.middleware.js';
import tenantMiddleware from '../middlewares/tenant.middleware.js';
import { requireRole } from '../middlewares/role.middleware.js';
import GetProjectionStatusController from '../app/Controllers/StatusApi/GetProjectionStatusController.js';

// Estados do consumidor em que o serviço está pronto. 'disabled' = sem RABBITMQ_HOST, de propósito.
const CONSUMIDOR_PRONTO = ['consuming', 'disabled'];

/**
 * `consumerStatus()`: estado do consumidor (consumer.js → status()). `checkDatabase()`: lança se o
 * banco do analytics não responde. Injetáveis para teste.
 */
export default function createRouter({
    consumerStatus = () => 'disabled',
    checkDatabase = () => sequelize.query('SELECT 1')
} = {}) {
    const router = Router();

    // Saúde sem autenticação — healthcheck do contêiner e probe de prontidão do k8s (qa-redteam H.2, 🟢-3).
    // Degradado (banco fora ou consumidor sem consumir) → 503: a projeção está parada. O erro do banco
    // não vai na resposta (pode ter host e detalhe de conexão).
    router.get('/health', async (request, response) => {
        let database = 'up';
        try {
            await checkDatabase();
        } catch {
            database = 'down';
        }
        const consumer = consumerStatus();
        const pronto = database === 'up' && CONSUMIDOR_PRONTO.includes(consumer);
        return response.status(pronto ? 200 : 503).json({
            status: pronto ? 'OK' : 'DEGRADED',
            database,
            consumer,
            timestamp: new Date().toISOString(),
            service: 'Gesway analytics-service'
        });
    });

    // Indicadores são dado gerencial — só ADMIN e RECEPTIONIST, como no core (analyticsRouter.js).
    // As 7 consultas entram neste router na H.3 (CA-01.4.k).
    const analyticsRouter = Router();
    analyticsRouter.use(authMiddleware, tenantMiddleware, requireRole('ADMIN', 'RECEPTIONIST'));
    analyticsRouter.get('/health', GetProjectionStatusController);

    router.use('/analytics', analyticsRouter);
    return router;
}
