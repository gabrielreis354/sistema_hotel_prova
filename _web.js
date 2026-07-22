import dotenv from 'dotenv';

// dotenv precisa carregar ANTES de qualquer módulo que leia process.env na própria
// avaliação (ex.: database/connections/sequelize.js, minio.js). Em ESM, imports
// estáticos são avaliados antes do corpo deste arquivo — não importa a ordem textual
// das linhas — então usamos import() dinâmico pra adiar esse carregamento pra depois
// do dotenv.config(). Mesmo padrão já usado em command.js.
dotenv.config({
    quiet: true,
    path: process.cwd() + '/.env'
});

const { default: express } = await import('express');
const { default: router } = await import('./routes/router.js');
const { default: app } = await import('./bootstrap/app.js');

// Inicializa os relacionamentos do Sequelize
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
