import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ quiet: true, path: path.join(__dirname, '.env') });

const command = process.argv[2];

// Cria/atualiza as projeções no banco PRÓPRIO do analytics. As projeções são derivadas dos eventos:
// se o schema precisar recomeçar do zero, a carga inicial do core (outbox-initial-load) as refaz.
async function migrate() {
    const { default: sequelize } = await import('./database/connections/sequelize.js');
    await import('./app/Models/index.js');

    try {
        await sequelize.authenticate();
        console.log('✅ Conexão com o banco do analytics estabelecida.');
        await sequelize.sync({ alter: true });
        console.log('✅ Projeções e processed_events atualizadas.');
    } catch (error) {
        console.error('❌ Erro ao executar migrations:', error.message);
        process.exitCode = 1;
    } finally {
        await sequelize.close();
    }
}

if (command === 'migrate') {
    migrate();
} else {
    console.log('Uso:');
    console.log('  node command.js migrate — cria/atualiza as projeções no banco do analytics');
    process.exit(1);
}
