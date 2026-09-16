import { Router } from 'express';
import PixWebhookController from '../../app/Controllers/WebhookApi/PixWebhookController.js';

/**
 * Router de WEBHOOKS de provedores externos (sem auth — o PSP não tem JWT).
 * Em produção, cada webhook deve validar a assinatura do provedor antes de confiar.
 */
export default (() => {
    const router = Router();

    router.post('/pix', PixWebhookController);

    return router;
})();
