import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const command = process.argv[2];

async function migrate() {
    const { default: sequelize } = await import('./database/connections/sequelize.js');
    const { default: initRelations } = await import('./database/relations.js');

    initRelations();

    try {
        await sequelize.authenticate();
        console.log('✅ Conexão com o banco de dados estabelecida.');

        await sequelize.sync({ alter: true });
        console.log('✅ Migrations executadas com sucesso. Todas as tabelas estão atualizadas.');

        // Objetos que o Sequelize não gerencia (extensão, EXCLUDE, CHECKs, índices
        // compostos). Compartilhado com tests/setup/globalSetup.js para que o banco
        // de teste não fique mais permissivo que o de produção.
        const { default: applyDbConstraints } = await import('./database/applyDbConstraints.js');
        await applyDbConstraints(sequelize, { log: console.log });
    } catch (error) {
        console.error('❌ Erro ao executar migrations:', error.message);
        process.exit(1);
    } finally {
        await sequelize.close();
        process.exit(0);
    }
}

if (command === 'migrate') {
    migrate();
} else {
    console.log('Uso:');
    console.log('  node command.js migrate    — cria/atualiza todas as tabelas no banco de dados');
    process.exit(1);
}
