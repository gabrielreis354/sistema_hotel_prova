import { Sequelize } from 'sequelize';

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
