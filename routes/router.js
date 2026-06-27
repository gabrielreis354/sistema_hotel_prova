import { Router } from 'express';
import express from 'express';
import swaggerUi from 'swagger-ui-express';
import swaggerSpec from '../config/swagger.js';
import authRouter         from './apis/authRouter.js';
import LoginController    from '../app/Controllers/AuthApi/LoginController.js';
import userRouter         from './apis/userRouter.js';
import roomCategoryRouter from './apis/roomCategoryRouter.js';
import roomRouter         from './apis/roomRouter.js';
import guestRouter        from './apis/guestRouter.js';
import reservationRouter  from './apis/reservationRouter.js';
import paymentRouter      from './apis/paymentRouter.js';
import analyticsRouter    from './apis/analyticsRouter.js';
import publicBookingRouter from './apis/publicBookingRouter.js';

const router = Router();

router.use(express.json());

// Health Check
router.get('/health', (request, response) => {
    return response.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        service: 'Sistema de Gestão de Hotel Backend'
    });
});

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
router.use('/room-categories',  roomCategoryRouter);
router.use('/rooms',            roomRouter);
router.use('/guests',           guestRouter);
router.use('/reservations',     reservationRouter);
router.use('/payments',         paymentRouter);
router.use('/analytics',        analyticsRouter);

// Motor de reserva direta — rotas PÚBLICAS (sem auth), tenant resolvido pelo subdomínio
router.use('/public/:subdomain', publicBookingRouter);

export default router;
