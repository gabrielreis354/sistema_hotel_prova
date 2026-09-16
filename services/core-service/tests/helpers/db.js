import sequelize from '../../database/connections/sequelize.js';

// Limpa todas as tabelas entre suites de teste via CASCADE na tabela raiz.
export async function truncateAll() {
    await sequelize.query('TRUNCATE TABLE tenants CASCADE');
}
