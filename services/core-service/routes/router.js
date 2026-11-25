import { Router } from 'express';
import express from 'express';
import swaggerUi from 'swagger-ui-express';
import swaggerSpec from '../config/swagger.js';
import corsMiddleware from '../middlewares/cors.middleware.js';
import { logError } from '../app/utils/logError.js';
import metricsMiddleware from '../middlewares/metrics.middleware.js';
import GetMetricsController from '../app/Controllers/MetricsApi/GetMetricsController.js';
import authRouter         from './apis/authRouter.js';
import LoginController    from '../app/Controllers/AuthApi/LoginController.js';
import userRouter         from './apis/userRouter.js';
import tenantRouter       from './apis/tenantRouter.js';
import roomCategoryRouter from './apis/roomCategoryRouter.js';
import roomRouter         from './apis/roomRouter.js';
import guestRouter        from './apis/guestRouter.js';
import reservationRouter  from './apis/reservationRouter.js';
import paymentRouter      from './apis/paymentRouter.js';
import analyticsRouter    from './apis/analyticsRouter.js';
import corporateClientRouter from './apis/corporateClientRouter.js';
import eventQuoteRouter from './apis/eventQuoteRouter.js';
import contractRouter from './apis/contractRouter.js';
import productRouter from './apis/productRouter.js';
import publicBookingRouter from './apis/publicBookingRouter.js';
import webhookRouter       from './apis/webhookRouter.js';
import addressRouter       from './apis/addressRouter.js';
import accountRouter       from './apis/accountRouter.js';

const router = Router();

// Métricas antes de tudo — mede inclusive o que o CORS ou o auth barrarem (T-02.4).
router.use(metricsMiddleware);

// CORS antes de tudo — o preflight (OPTIONS) precisa ser respondido sem passar
// por auth. Fica aqui, no router compartilhado por _web.js e pelos testes.
router.use(corsMiddleware);

// `verify` guarda o BUFFER CRU do corpo em request.rawBody antes do parse.
// Necessário para o webhook PIX (T-06.9): o HMAC do PSP é calculado sobre os
// bytes exatos enviados, e por aqui o corpo já está consumido quando chega ao
// controller. JSON.stringify(request.body) não serve — pode diferir do que
// foi de fato transmitido (ordem de chaves, espaçamento).
router.use(express.json({
    verify: (request, response, buf) => {
        request.rawBody = buf;
    }
}));

// Health Check
router.get('/health', (request, response) => {
    return response.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        service: 'Sistema de Gestão de Hotel Backend'
    });
});

// Métricas Prometheus — protegido por METRICS_TOKEN, não é público (ver controller)
// /metrics em Router próprio com caseSensitive e strict: o router principal casa sem distinguir
// caixa e com barra final opcional, e /METRICS ou /metrics/ escapavam do bloqueio do nginx, que
// só barrava o caminho exato (qa-redteam de 12/10, 🔴-1). Só "/metrics" exato responde aqui.
const metricsRouter = Router({ caseSensitive: true, strict: true });
metricsRouter.get('/metrics', GetMetricsController);
router.use(metricsRouter);

router.get('/', (request, response) => {
    return response.json({
        message: 'Bem-vindo ao Backend do Sistema de Gestão de Hotel',
        docs: '/api-docs'
    });
});

// Documentação Swagger
router.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Alias em /login — o login canônico está em /auth/login
router.post('/login', LoginController);

// APIs REST
router.use('/auth',             authRouter);
router.use('/users',            userRouter);
router.use('/tenants',          tenantRouter);
router.use('/room-categories',  roomCategoryRouter);
router.use('/rooms',            roomRouter);
router.use('/guests',           guestRouter);
router.use('/reservations',     reservationRouter);
router.use('/payments',         paymentRouter);
router.use('/analytics',        analyticsRouter);
router.use('/corporate-clients', corporateClientRouter);
router.use('/event-quotes',      eventQuoteRouter);
router.use('/contracts',         contractRouter);
router.use('/products',          productRouter);
router.use('/accounts',          accountRouter);
router.use('/address',           addressRouter);

// Motor de reserva direta — rotas PÚBLICAS (sem auth), tenant resolvido pelo subdomínio
router.use('/public/:subdomain', publicBookingRouter);

// Webhooks de provedores externos (ex.: confirmação de PIX)
router.use('/webhooks', webhookRouter);

// Erro que nenhuma rota tratou. Sem este middleware, o JSON malformado ia ao `finalhandler` do
// Express, que imprime a pilha do SyntaxError com um trecho do corpo, ou seja, o dado do hóspede,
// inclusive nas rotas públicas (qa-redteam da T-06.12, 22/11; LGPD art. 46). O corpo não vai ao log.
// O Express reconhece o middleware de erro pelos 4 parâmetros.
router.use((error, request, response, next) => {
    if (response.headersSent) return next(error);
    if (error.type === 'entity.parse.failed') return response.status(400).json({ error: 'JSON inválido' });
    const status = error.status ?? error.statusCode;
    if (status >= 400 && status < 500) return response.status(status).json({ error: 'Requisição inválida' });
    logError('router', error);
    return response.status(500).json({ error: 'Erro interno do servidor' });
});

export default router;
