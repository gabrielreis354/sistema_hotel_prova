import sequelize from '../../database/connections/sequelize.js';

// Limpa todas as tabelas entre suites de teste via CASCADE na tabela raiz.
export async function truncateAll() {
    // outbox não tem FK para tenants (evento não pode travar exclusão nenhuma) — limpa à parte.
    await sequelize.query('TRUNCATE TABLE tenants, outbox CASCADE');
}
