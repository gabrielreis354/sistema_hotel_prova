import express from 'express';
import router from '../routes/router.js';

// App Express sem listen() — usado pelo _web.js e pelos testes (supertest).
export default function createApp() {
    const app = express();
    app.disable('x-powered-by');
    app.use('/', router);
    return app;
}
