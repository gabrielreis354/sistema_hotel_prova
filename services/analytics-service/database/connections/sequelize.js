import { Sequelize } from 'sequelize';

// Limites de cada operação no banco (reauditoria delta 3 da H.2, 🟡-A3): todo apply do consumidor tem fim.
// Sem eles, um apply esperava o pool por até 60 s (padrão do Sequelize) e passava de qualquer prazo de
// drenagem da pausa. Estourado o acquire → SequelizeConnectionAcquireTimeoutError (pool esgotado, tratado
// como banco fora: pausa com teto); estourado o statement_timeout → SQLSTATE 57014 (conta tentativa).
const PADRAO_MS = 5000;

/** Inteiro positivo do env; ausente ou inválido cai no padrão (fail-safe: nunca sem limite). */
function msDoEnv(valor) {
    const n = Number(valor);
    return Number.isInteger(n) && n > 0 ? n : PADRAO_MS;
}

export function opcoesDoBanco(env = process.env) {
    return {
        host: env.POSTGRES_HOST,
        port: Number(env.POSTGRES_PORT),
        dialect: 'postgres',
        logging: false,
        pool: { acquire: msDoEnv(env.POSTGRES_ACQUIRE_TIMEOUT_MS) },
        dialectOptions: { statement_timeout: msDoEnv(env.POSTGRES_STATEMENT_TIMEOUT_MS) }
    };
}

// Banco PRÓPRIO do analytics (CA-01.4.g): `gesway_analytics`, separado do banco do core. O analytics
// nunca lê as tabelas do core — tudo o que sabe chega por evento (ADR-003).
export default new Sequelize(
    process.env.POSTGRES_DB,
    process.env.POSTGRES_USER,
    process.env.POSTGRES_PASSWORD || undefined,
    opcoesDoBanco()
);
