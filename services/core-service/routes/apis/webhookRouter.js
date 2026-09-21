import { Router } from 'express';
import PixWebhookController from '../../app/Controllers/WebhookApi/PixWebhookController.js';

/**
 * Router de WEBHOOKS de provedores externos (sem JWT — o PSP não tem usuário).
 * Cada endpoint valida sua própria assinatura antes de confiar em qualquer
 * dado do corpo: PixWebhookController verifica HMAC-SHA256 (T-06.9).
 */
export default (() => {
    const router = Router();

    router.post('/pix', PixWebhookController);

    return router;
})();
