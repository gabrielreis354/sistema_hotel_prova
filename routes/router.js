import { Router } from 'express';
import express from 'express';
import authRouter         from './apis/authRouter.js';
import userRouter         from './apis/userRouter.js';
import roomCategoryRouter from './apis/roomCategoryRouter.js';
import roomRouter         from './apis/roomRouter.js';
import guestRouter        from './apis/guestRouter.js';
import reservationRouter  from './apis/reservationRouter.js';

const router = Router();

// Habilita parsing de corpo em formato JSON para todas as rotas
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
        message: 'Bem-vindo ao Backend do Sistema de Gestão de Hotel (SaaS Multi-Tenant)'
    });
});

// APIs REST
router.use('/auth',             authRouter);
router.use('/users',            userRouter);
router.use('/room-categories',  roomCategoryRouter);
router.use('/rooms',            roomRouter);
router.use('/guests',           guestRouter);
router.use('/reservations',     reservationRouter);

export default router;
