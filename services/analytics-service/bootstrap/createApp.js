import express from 'express';
import createRouter from '../routes/router.js';

// App Express sem listen() — usado pelo _web.js e pelos testes (supertest).
// `options` vai para o router: { consumerStatus, checkDatabase } (saúde).
export default function createApp(options = {}) {
    const app = express();
    app.disable('x-powered-by');
    app.use('/', createRouter(options));
    return app;
}
