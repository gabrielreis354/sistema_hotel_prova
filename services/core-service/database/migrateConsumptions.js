/**
 * Migração de dados da T-04.2: `consumptions` → `account_items` (SPEC-04, CA-04.2.a–c).
 *
 * Roda no fim do `node command.js migrate`, depois do sync e das constraints, sempre:
 * é idempotente, e em banco já migrado (ou sem a tabela antiga) não faz nada.
 *
 * Regras:
 *   - Cada consumo vira um item com o MESMO id — links e DELETEs antigos continuam valendo.
 *   - quantity 1, unit_price = total = amount (o CHECK total = quantity × unit_price fecha).
 *   - created_at, consumed_at, deleted_at e deleted_by preservados (CA-04.2.b/c).
 *   - origin LEGACY_CONSUMPTION e created_by nulo: o consumo antigo não registrava autor,
 *     e autoria não é inventada (D-25).
 *   - O item vai para a conta ROOM que cobra a diária do quarto principal da reserva —
 *     reaproveitada se já existir, senão criada OPEN, rótulo sem nome de hóspede (D-28).
 *
 * Tudo numa transação. Pré-checagens com mensagem clara e uma verificação linha a linha
 * no fim: qualquer divergência desfaz tudo, nunca migra pela metade.
 *
 * A tabela `consumptions` NÃO é apagada (D-27): fica como trilha até a confirmação em
 * produção.
 *
 * @param {import('sequelize').Sequelize} sequelize
 * @param {{ log?: (msg: string) => void }} [options]
 * @returns {Promise<{ skipped: boolean, accounts: number, items: number }>}
 */
export default async function migrateConsumptions(sequelize, { log = () => {} } = {}) {
    const [[{ existe }]] = await sequelize.query(
        `SELECT to_regclass('public.consumptions') IS NOT NULL AS existe`
    );
    if (!existe) return { skipped: true, accounts: 0, items: 0 };

    return sequelize.transaction(async (transaction) => {
        const query = (sql, replacements) => sequelize.query(sql, { transaction, replacements });

        // Pendentes = consumos que ainda não têm item com o mesmo id. É o que torna a
        // migração idempotente e o que a verificação final confere.
        const [pendentes] = await query(`
            SELECT c.id FROM consumptions c
            WHERE NOT EXISTS (SELECT 1 FROM account_items ai WHERE ai.id = c.id)`);
        const ids = pendentes.map((p) => p.id);
        if (ids.length === 0) return { skipped: false, accounts: 0, items: 0 };

        // account_items.total é NUMERIC(10,2); consumptions.amount é (12,2).
        const [[{ fora }]] = await query(`
            SELECT count(*)::int AS fora FROM consumptions
            WHERE id IN (:ids) AND (amount < 0 OR amount > 99999999.99)`, { ids });
        if (fora > 0) {
            throw new Error(`migração de consumos: ${fora} consumo(s) com amount fora de 0 a 99999999.99, `
                + 'que não cabe em account_items. Nada foi migrado.');
        }

        // O item herda o hotel do consumo e a conta herda o da reserva: precisam ser o mesmo.
        const [[{ divergentes }]] = await query(`
            SELECT count(*)::int AS divergentes FROM consumptions c
            JOIN reservations r ON r.id = c.reservation_id
            WHERE c.id IN (:ids) AND c.tenant_id <> r.tenant_id`, { ids });
        if (divergentes > 0) {
            throw new Error(`migração de consumos: ${divergentes} consumo(s) com hotel diferente do da reserva. `
                + 'Nada foi migrado.');
        }

        // Conta da suíte para cada reserva com consumo pendente que ainda não tem uma
        // cobrando a diária do quarto principal. Mesmo rótulo de roomAccountLabel().
        const [contas] = await query(`
            INSERT INTO accounts (id, tenant_id, type, status, reservation_id, room_id, guest_id,
                                  label, charges_lodging, opened_at, created_at, updated_at)
            SELECT gen_random_uuid(), r.tenant_id, 'ROOM', 'OPEN', r.id, r.room_id, r.guest_id,
                   'Suíte ' || ro.number, true, p.primeiro, now(), now()
            FROM (
                SELECT reservation_id, MIN(LEAST(consumed_at, COALESCE(created_at, consumed_at))) AS primeiro
                FROM consumptions WHERE id IN (:ids) GROUP BY reservation_id
            ) p
            JOIN reservations r ON r.id = p.reservation_id
            JOIN rooms ro       ON ro.id = r.room_id
            WHERE NOT EXISTS (
                SELECT 1 FROM accounts a
                WHERE a.reservation_id = r.id AND a.room_id = r.room_id
                  AND a.charges_lodging AND a.deleted_at IS NULL
            )
            RETURNING id`, { ids });

        const [itens] = await query(`
            INSERT INTO account_items (id, tenant_id, account_id, product_id, description, quantity,
                                       unit_price, total, billable, reason, client_item_id,
                                       created_by, deleted_by, origin, consumed_at, deleted_at,
                                       created_at, updated_at)
            SELECT c.id, c.tenant_id, a.id, NULL, c.description, 1,
                   c.amount, c.amount, true, NULL, NULL,
                   NULL, c.deleted_by, 'LEGACY_CONSUMPTION', c.consumed_at, c.deleted_at,
                   COALESCE(c.created_at, c.consumed_at), COALESCE(c.updated_at, c.created_at, c.consumed_at)
            FROM consumptions c
            JOIN reservations r ON r.id = c.reservation_id
            JOIN accounts a     ON a.reservation_id = r.id AND a.room_id = r.room_id
                               AND a.charges_lodging AND a.deleted_at IS NULL
            WHERE c.id IN (:ids)
            ON CONFLICT (id) DO NOTHING
            RETURNING id`, { ids });

        // Verificação linha a linha, só do que esta execução migrou (um item migrado antes
        // pode ter sido excluído depois pela rota antiga, e isso não é divergência).
        const [[{ erradas }]] = await query(`
            SELECT count(*)::int AS erradas FROM consumptions c
            LEFT JOIN account_items ai ON ai.id = c.id
            WHERE c.id IN (:ids) AND (
                   ai.id IS NULL
                OR ai.origin <> 'LEGACY_CONSUMPTION'
                OR ai.tenant_id <> c.tenant_id
                OR ai.total <> c.amount
                OR ai.consumed_at <> c.consumed_at
                OR ai.deleted_at IS DISTINCT FROM c.deleted_at
                OR ai.deleted_by IS DISTINCT FROM c.deleted_by
            )`, { ids });
        if (erradas > 0) {
            throw new Error(`migração de consumos: ${erradas} consumo(s) sem item idêntico depois da cópia. `
                + 'Nada foi migrado.');
        }

        log(`✅ Consumos migrados: ${itens.length} item(ns), ${contas.length} conta(s) de suíte criada(s).`);
        return { skipped: false, accounts: contas.length, items: itens.length };
    });
}
