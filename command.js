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

        // Não relança ainda se falhar: um banco legado provisionado por db/schema.sql
        // (nomes de índice autogerados, tabelas já existentes) pode fazer o
        // sync({alter}) morrer aqui por um motivo TOTALMENTE ALHEIO à cura dos índices
        // únicos (ex.: um enum que mudou em outra tabela). Sem esta separação, a cura
        // nunca era alcançada nesse caminho — achado 🟡-1 da auditoria — porque o catch
        // do fim da função saía direto, antes do applyDbConstraints ser sequer importado.
        let erroSync = null;
        try {
            await sequelize.sync({ alter: true });
            console.log('✅ Migrations executadas com sucesso. Todas as tabelas estão atualizadas.');
        } catch (erro) {
            erroSync = erro;
        }

        // Objetos que o Sequelize não gerencia (extensão, EXCLUDE, CHECKs, índices
        // compostos). Compartilhado com tests/setup/globalSetup.js para que o banco
        // de teste não fique mais permissivo que o de produção.
        const { default: applyDbConstraints } = await import('./database/applyDbConstraints.js');
        try {
            await applyDbConstraints(sequelize, { log: console.log });
        } catch (erroConstraints) {
            // Se o sync já tinha falhado, a causa raiz é dele — não deixa uma falha
            // secundária de constraints (esperável num banco que o sync nem terminou de
            // ajustar) mascarar o erro que realmente importa reportar.
            if (!erroSync) throw erroConstraints;
            console.error('⚠️  applyDbConstraints também falhou após o sync:', erroConstraints.message);
        }

        if (erroSync) throw erroSync;
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
