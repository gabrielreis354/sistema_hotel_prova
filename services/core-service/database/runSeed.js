import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SEED_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'seed');

// A ordem importa: a comanda (T-04.7) usa hotéis, quartos e reservas do primeiro, e o seed_hoje
// ancora o cenário no dia em que roda.
export const SEED_FILES = ['seed_hotels.sql', 'seed_consumo.sql', 'seed_hoje.sql'];

/**
 * Aplica os arquivos do seed e devolve os avisos do banco (`RAISE NOTICE` e `RAISE WARNING`).
 *
 * O Sequelize não escuta o evento `notice` do pg, e o `sequelize.query` descartava os avisos:
 * o WARNING de cenário incompleto do seed_hoje.sql nunca chegava a quem rodou o seed (repasse do
 * red team do #176). Por isso os arquivos rodam numa conexão pedida ao pool, com o ouvinte ligado
 * só nela. O backend não é afetado: nenhuma outra conexão recebe o ouvinte.
 *
 * Os três arquivos rodam na mesma conexão. Cada um traz o próprio BEGIN/COMMIT e é idempotente
 * (ON CONFLICT / NOT EXISTS); o protocolo simples do pg, sem parâmetros, roda o arquivo inteiro.
 *
 * `agora` simula o relógio (os testes fixam o dia). Ele vai pela variável de sessão `seed.agora`,
 * que o seed_hoje.sql lê, com `set_config` parametrizado, e é desfeito antes de a conexão voltar
 * ao pool.
 *
 * Na falha, o erro sobe com `error.notices`: os avisos recolhidos até ali.
 *
 * @returns {Promise<{ notices: { severity: string, message: string }[] }>}
 */
export default async function runSeed(sequelize, { agora } = {}) {
    const notices = [];
    const onNotice = (n) => notices.push({ severity: n.severity, message: n.message });
    const client = await sequelize.connectionManager.getConnection();
    client.on('notice', onNotice);
    let failed = false;
    // O Sequelize liga a conexão com client_min_messages = warning, e com isso o banco nem envia o
    // NOTICE (o resumo do dia, a linha pulada). Baixa para notice só nesta conexão e devolve o valor
    // de antes no fim, para o pool continuar como o Sequelize deixou.
    let nivelAntes = null;
    try {
        const { rows } = await client.query(`SELECT current_setting('client_min_messages') AS nivel`);
        nivelAntes = rows[0].nivel;
        await client.query(`SELECT set_config('client_min_messages', 'notice', false)`);
        if (agora) await client.query(`SELECT set_config('seed.agora', $1, false)`, [agora]);
        for (const file of SEED_FILES) {
            const sql = await readFile(path.join(SEED_DIR, file), 'utf-8');
            await client.query(sql);
        }
        return { notices };
    } catch (error) {
        failed = true;
        // Os avisos que chegaram antes da falha vão junto com o erro (🟢-2 do red team de 18/11).
        error.notices = notices;
        throw error;
    } finally {
        // Um arquivo que falhou no meio deixa a transação dele aberta e abortada: a conexão não pode
        // voltar assim ao pool, senão a próxima consulta do backend herda o erro.
        if (failed) await client.query('ROLLBACK').catch(() => {});
        await client.query('RESET seed.agora').catch(() => {});
        if (nivelAntes) {
            await client.query(`SELECT set_config('client_min_messages', $1, false)`, [nivelAntes]).catch(() => {});
        }
        client.removeListener('notice', onNotice);
        sequelize.connectionManager.releaseConnection(client);
    }
}

/**
 * O que o `node command.js seed` imprime: cada aviso com a severidade e, no fim, sucesso só quando
 * não houve WARNING. Com WARNING o seed foi aplicado (a saída continua 0, como no psql), mas a
 * última linha manda conferir.
 */
export function seedReport(notices) {
    const lines = notices.map((n) =>
        n.severity === 'WARNING' ? `   ⚠️ WARNING: ${n.message}` : `   ${n.severity}: ${n.message}`,
    );
    const warnings = notices.filter((n) => n.severity === 'WARNING').length;
    const final = warnings
        ? `⚠️ Seed aplicado com ${warnings} aviso(s): confira acima antes de usar o banco na demonstração.`
        : '✅ Seed executado com sucesso.';
    return { lines, final };
}
