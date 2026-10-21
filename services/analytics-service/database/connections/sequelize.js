import { Sequelize } from 'sequelize';

// Banco PRÓPRIO do analytics (CA-01.4.g): `gesway_analytics`, separado do banco do core. O analytics
// nunca lê as tabelas do core — tudo o que sabe chega por evento (ADR-003).
export default (() => {
    return new Sequelize(
        process.env.POSTGRES_DB,
        process.env.POSTGRES_USER,
        process.env.POSTGRES_PASSWORD || undefined,
        {
            host: process.env.POSTGRES_HOST,
            port: Number(process.env.POSTGRES_PORT),
            dialect: 'postgres',
            logging: false
        }
    );
})();
