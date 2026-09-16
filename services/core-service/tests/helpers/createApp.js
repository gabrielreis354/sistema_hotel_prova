import express from 'express';
import router from '../../routes/router.js';

// Cria o app Express sem chamar listen() — ideal para supertest.
// initRelations() já foi chamado em tests/setup/env.js (setupFile).
export function createApp() {
    const app = express();
    app.use('/', router);
    return app;
}
