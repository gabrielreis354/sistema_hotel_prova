import express from 'express';
import router from './routes/router.js';
import app from "./bootstrap/app.js";

// Inicializa variáveis de ambiente e relacionamentos do Sequelize
app();

const web = express();

// Registrar as Rotas Principais
web.use('/', router);

const port = process.env.NODE_WEB_PORT || 3000;

web.listen(port, () => {
    console.log(`\n==================================================`);
    console.log(`🚀 Servidor Hotel PMS rodando com sucesso!`);
    console.log(`📡 URL Local: http://localhost:${port}`);
    console.log(`💾 Banco de Dados PostgreSQL conectado via Sequelize`);
    console.log(`==================================================\n`);
});
