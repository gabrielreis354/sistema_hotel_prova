// Repasse do red team do #176 (docs/qa/repasses/para_sirlande_16112026_seed_notice.md): o
// `node command.js seed` descartava o NOTICE e o WARNING do seed_hoje.sql, porque o Sequelize não
// escuta o evento `notice` do pg. Na véspera da banca, um cenário incompleto saía como
// "✅ Seed executado com sucesso.". Pelo psql (`./start.sh seed`), os avisos aparecem.
import { describe, it, expect } from 'vitest';
import sequelize from '../database/connections/sequelize.js';
import runSeed, { seedReport } from '../database/runSeed.js';
import { truncateAll } from './helpers/db.js';

const warnings = (notices) => notices.filter((n) => n.severity === 'WARNING');
const resumo = (notices) => notices.filter((n) => /^seed_hoje: (aurora|sol) em /.test(n.message));

describe('runSeed — os avisos do banco chegam a quem rodou o seed', () => {
    it('banco limpo: traz o resumo do dia de cada hotel e nenhum WARNING', async () => {
        await truncateAll();
        const { notices } = await runSeed(sequelize, { agora: '2026-12-10 15:00-03' });
        expect(resumo(notices).map((n) => n.message)).toEqual([
            'seed_hoje: aurora em 2026-12-10: 2 chegada(s), 4 na casa, 1 saída(s)',
            'seed_hoje: sol em 2026-12-10: 1 chegada(s), 2 na casa, 1 saída(s)',
        ]);
        expect(resumo(notices).every((n) => n.severity === 'NOTICE')).toBe(true);
        expect(warnings(notices)).toEqual([]);
    });

    it('banco usado na demonstração: o WARNING do cenário incompleto aparece', async () => {
        await truncateAll();
        await runSeed(sequelize, { agora: '2026-12-10 15:00-03' });
        // A recepção cancelou a chegada do 102 durante o ensaio (mesmo caso do seed-hoje.test.js).
        await sequelize.query(`UPDATE reservations SET status = 'CANCELLED'
            WHERE room_id = (SELECT rm.id FROM rooms rm JOIN tenants t ON t.id = rm.tenant_id
                              WHERE t.subdomain = 'aurora' AND rm.number = '102')
              AND check_in_date = '2026-12-10'`);
        const { notices } = await runSeed(sequelize, { agora: '2026-12-11 15:00-03' });
        const w = warnings(notices);
        expect(w).toHaveLength(1);
        expect(w[0].message).toMatch(/^seed_hoje: o cenário de aurora não ficou completo/);
    });

    // 🟢 do repasse: o seed também roda no cluster (`./start.sh seed`, #177), e lá o caminho é outro.
    it('o WARNING diz como recriar o banco no compose e no k8s', async () => {
        await truncateAll();
        await runSeed(sequelize, { agora: '2026-12-10 15:00-03' });
        await sequelize.query(`UPDATE reservations SET status = 'CANCELLED'
            WHERE room_id = (SELECT rm.id FROM rooms rm JOIN tenants t ON t.id = rm.tenant_id
                              WHERE t.subdomain = 'aurora' AND rm.number = '102')
              AND check_in_date = '2026-12-10'`);
        const [w] = warnings((await runSeed(sequelize, { agora: '2026-12-11 15:00-03' })).notices);
        expect(w.message).toContain('docker compose down -v');
        expect(w.message).toContain('./start.sh down');
    });

    it('cada chamada traz só os próprios avisos (o ouvinte sai da conexão no fim)', async () => {
        await truncateAll();
        await runSeed(sequelize, { agora: '2026-12-10 15:00-03' });
        const { notices } = await runSeed(sequelize, { agora: '2026-12-10 16:00-03' });
        expect(resumo(notices)).toHaveLength(2);
    });

    // O Sequelize liga toda conexão com client_min_messages = warning, e o banco nem envia o NOTICE.
    // O runSeed baixa para notice só na conexão dele e devolve o valor antes de soltá-la no pool.
    it('nem o relógio simulado nem o nível de aviso vazam para o pool', async () => {
        await truncateAll();
        await runSeed(sequelize, { agora: '2026-12-10 15:00-03' });
        const rows = await Promise.all(
            Array.from({ length: 5 }, () =>
                sequelize.query(
                    `SELECT current_setting('seed.agora', true) AS agora, current_setting('client_min_messages') AS nivel`,
                    { plain: true },
                )),
        );
        expect(rows.map((r) => [r.agora ?? '', r.nivel])).toEqual(Array(5).fill(['', 'warning']));
    });
});

describe('seedReport — o que o `node command.js seed` imprime', () => {
    it('sem WARNING: cada aviso com a severidade e o sucesso no fim', () => {
        const r = seedReport([{ severity: 'NOTICE', message: 'seed_hoje: aurora em 2026-12-10: 2 chegada(s)' }]);
        expect(r.lines).toEqual(['   NOTICE: seed_hoje: aurora em 2026-12-10: 2 chegada(s)']);
        expect(r.final).toBe('✅ Seed executado com sucesso.');
    });

    it('com WARNING: a última linha não diz só "sucesso"', () => {
        const r = seedReport([
            { severity: 'NOTICE', message: 'a' },
            { severity: 'WARNING', message: 'b' },
            { severity: 'WARNING', message: 'c' },
        ]);
        expect(r.lines).toEqual(['   NOTICE: a', '   ⚠️ WARNING: b', '   ⚠️ WARNING: c']);
        expect(r.final).toBe('⚠️ Seed aplicado com 2 aviso(s): confira acima antes de usar o banco na demonstração.');
    });
});
