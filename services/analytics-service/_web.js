import dotenv from 'dotenv';

// dotenv ANTES de qualquer módulo que leia process.env na avaliação (sequelize.js) — por isso o resto
// entra por import() dinâmico, como no core.
dotenv.config({ quiet: true, path: process.cwd() + '/.env' });

const { getPublicKey } = await import('./app/utils/jwtPublicKey.js');
const { default: createApp } = await import('./bootstrap/createApp.js');
const { default: sequelize } = await import('./database/connections/sequelize.js');
const { startConsumerFromEnv } = await import('./app/consumer/consumer.js');

// Fail-fast (ADR-006): sem chave pública RSA válida — ou com a PRIVADA montada no lugar — não sobe.
try {
    getPublicKey();
} catch (error) {
    console.error(`❌ JWT RS256 indisponível — analytics não vai subir. ${error.message}`);
    process.exit(1);
}

const port = process.env.NODE_WEB_PORT || 3001;
createApp().listen(port, () => {
    console.log(`🚀 analytics-service ouvindo na porta ${port}`);
});

// O consumidor só começa quando o banco responde e o schema existe (`node command.js migrate`):
// sem as tabelas, cada evento falharia 5 vezes e iria para a fila de mensagens mortas.
async function schemaPronto() {
    const [{ existe }] = await sequelize.query(
        "SELECT to_regclass('public.processed_events') IS NOT NULL AS existe",
        { type: 'SELECT' }
    );
    if (!existe) throw new Error('schema do analytics ausente — rode "node command.js migrate"');
}

startConsumerFromEnv({ ready: schemaPronto });
