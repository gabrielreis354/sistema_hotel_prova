import { describe, it, expect } from 'vitest';
import sequelize, { opcoesDoBanco } from '../database/connections/sequelize.js';
import { isInfrastructureFailure, isPermanent } from '../app/consumer/consumer.js';

// 🟡-A3 (reauditoria delta 3 da H.2): todo apply do consumidor tem fim. Sem limite, um apply podia esperar
// o pool por até 60 s (padrão do Sequelize) e estourar qualquer prazo de drenagem da pausa.

describe('🟡-A3 — limites da conexão do analytics', () => {
    it('padrão de 5 s para o acquire do pool e para o statement_timeout', () => {
        const o = opcoesDoBanco({ POSTGRES_HOST: 'h', POSTGRES_PORT: '5432' });
        expect(o.pool.acquire).toBe(5000);
        expect(o.dialectOptions.statement_timeout).toBe(5000);
    });

    it('configuráveis por env', () => {
        const o = opcoesDoBanco({ POSTGRES_ACQUIRE_TIMEOUT_MS: '2500', POSTGRES_STATEMENT_TIMEOUT_MS: '3000' });
        expect(o.pool.acquire).toBe(2500);
        expect(o.dialectOptions.statement_timeout).toBe(3000);
    });

    it('valor inválido no env cai no padrão (fail-safe: nunca sem limite)', () => {
        const o = opcoesDoBanco({ POSTGRES_ACQUIRE_TIMEOUT_MS: 'abc', POSTGRES_STATEMENT_TIMEOUT_MS: '0' });
        expect(o.pool.acquire).toBe(5000);
        expect(o.dialectOptions.statement_timeout).toBe(5000);
    });

    it('banco real: a sessão sobe com statement_timeout de 5 s', async () => {
        const [{ statement_timeout }] = await sequelize.query('SHOW statement_timeout', { type: 'SELECT' });
        expect(statement_timeout).toBe('5s');
    });

    it('banco real: consulta mais longa que o limite é cancelada (57014) e conta como tentativa, não como banco fora', async () => {
        const erro = await sequelize.query('SELECT pg_sleep(6)').catch((e) => e);
        expect(erro?.original?.code ?? erro?.parent?.code).toBe('57014');
        expect(isInfrastructureFailure(erro)).toBe(false);
        expect(isPermanent(erro)).toBe(false);
    }, 15000);
});
