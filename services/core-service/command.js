import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import { readFile } from 'fs/promises';

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

async function seed() {
    // NODE_ENV=production não é garantia de "banco real" — é o valor default do próprio
    // docker-compose de contingência (T-06.4). Sem esta trava, "kubectl exec ... node
    // command.js seed" digitado por engano cria um ADMIN com a senha documentada
    // (senha123) no banco de produção de verdade.
    if (process.env.NODE_ENV === 'production' && process.env.ALLOW_SEED !== '1') {
        console.error('❌ Recusado: NODE_ENV=production sem ALLOW_SEED=1.');
        console.error('   O seed cria usuários com senha conhecida (senha123) — só rode de propósito.');
        console.error('   Confirme com: ALLOW_SEED=1 node command.js seed');
        process.exit(1);
    }

    const { default: sequelize } = await import('./database/connections/sequelize.js');

    try {
        await sequelize.authenticate();
        console.log('✅ Conexão com o banco de dados estabelecida.');

        // seed_hotels.sql é idempotente (ON CONFLICT DO NOTHING) e já traz seu próprio
        // BEGIN/COMMIT — uma única chamada via o client pg por trás do Sequelize
        // (protocolo simples, sem bind de parâmetros) roda o arquivo inteiro.
        const sqlPath = path.join(__dirname, 'seed', 'seed_hotels.sql');
        const sql = await readFile(sqlPath, 'utf-8');
        await sequelize.query(sql);

        console.log('✅ Seed executado com sucesso.');
    } catch (error) {
        console.error('❌ Erro ao executar o seed:', error.message);
        process.exit(1);
    } finally {
        await sequelize.close();
        process.exit(0);
    }
}

if (command === 'migrate') {
    migrate();
} else if (command === 'seed') {
    seed();
} else {
    console.log('Uso:');
    console.log('  node command.js migrate    — cria/atualiza todas as tabelas no banco de dados');
    console.log('  node command.js seed       — popula o banco com dados de demonstração (idempotente)');
    process.exit(1);
}
