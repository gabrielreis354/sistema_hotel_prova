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
 *     reaproveitada se já existir, senão criada com rótulo sem nome de hóspede (D-28).
 *     Reserva encerrada (check-out, cancelada ou excluída) ganha a conta já CLOSED:
 *     ninguém mais vai fechá-la, e aberta lotaria as comandas do garçom (D-30).
 *
 * Por reserva, não tudo-ou-nada (D-31): reserva com dado inválido (valor que não cabe em
 * NUMERIC(10,2), hotel do consumo diferente do da reserva) fica para trás INTEIRA — nunca
 * pela metade — e as outras migram. No fim, se alguma ficou, lança erro listando-as: o
 * `migrate` sai com código 1. Enquanto isso, o bill e a lista dessas reservas respondem
 * 503 (app/utils/pendingLegacyConsumption.js) em vez de mostrar um valor sem os consumos.
 *
 * A cópia das reservas válidas é uma transação, com verificação linha a linha no fim:
 * divergência ali é defeito da migração, e desfaz tudo.
 *
 * A tabela `consumptions` NÃO é apagada (D-27).
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

    const resultado = await sequelize.transaction(async (transaction) => {
        const query = (sql, replacements) => sequelize.query(sql, { transaction, replacements });

        // Pendentes = consumos que ainda não têm item com o mesmo id (idempotência).
        const [pendentes] = await query(`
            SELECT c.id, c.reservation_id,
                   (c.amount < 0 OR c.amount > 99999999.99) AS valor_invalido,
                   (r.id IS NULL OR c.tenant_id <> r.tenant_id) AS hotel_divergente
            FROM consumptions c
            LEFT JOIN reservations r ON r.id = c.reservation_id
            WHERE NOT EXISTS (SELECT 1 FROM account_items ai WHERE ai.id = c.id)`);
        if (pendentes.length === 0) return { accounts: 0, items: 0, paraTras: [] };

        // Uma linha inválida tira a reserva inteira desta execução.
        const paraTras = [...new Set(pendentes
            .filter((p) => p.valor_invalido || p.hotel_divergente)
            .map((p) => p.reservation_id))];
        const ids = pendentes.filter((p) => !paraTras.includes(p.reservation_id)).map((p) => p.id);
        if (ids.length === 0) return { accounts: 0, items: 0, paraTras };

        // Conta da suíte para cada reserva com consumo pendente que ainda não tem uma
        // cobrando a diária do quarto principal. Mesmo rótulo de roomAccountLabel().
        const [contas] = await query(`
            INSERT INTO accounts (id, tenant_id, type, status, reservation_id, room_id, guest_id,
                                  label, charges_lodging, opened_at, closed_at, created_at, updated_at)
            SELECT gen_random_uuid(), r.tenant_id, 'ROOM', e.status, r.id, r.room_id, r.guest_id,
                   'Suíte ' || ro.number, true, p.primeiro,
                   CASE WHEN e.status = 'CLOSED' THEN now() END, now(), now()
            FROM (
                SELECT reservation_id, MIN(LEAST(consumed_at, COALESCE(created_at, consumed_at))) AS primeiro
                FROM consumptions WHERE id IN (:ids) GROUP BY reservation_id
            ) p
            JOIN reservations r ON r.id = p.reservation_id
            JOIN rooms ro       ON ro.id = r.room_id
            CROSS JOIN LATERAL (
                SELECT CASE WHEN r.status IN ('CHECKED_OUT', 'CANCELLED') OR r.deleted_at IS NOT NULL
                            THEN 'CLOSED' ELSE 'OPEN' END AS status
            ) e
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
            LEFT JOIN accounts a       ON a.id = ai.account_id
            WHERE c.id IN (:ids) AND (
                   ai.id IS NULL
                OR ai.origin <> 'LEGACY_CONSUMPTION'
                OR ai.tenant_id <> c.tenant_id
                OR a.reservation_id IS DISTINCT FROM c.reservation_id
                OR ai.description <> c.description
                OR ai.quantity <> 1
                OR ai.unit_price <> c.amount
                OR ai.total <> c.amount
                OR ai.created_at IS DISTINCT FROM COALESCE(c.created_at, c.consumed_at)
                OR ai.consumed_at <> c.consumed_at
                OR ai.deleted_at IS DISTINCT FROM c.deleted_at
                OR ai.deleted_by IS DISTINCT FROM c.deleted_by
            )`, { ids });
        if (erradas > 0) {
            throw new Error(`migração de consumos: ${erradas} consumo(s) sem item idêntico depois da cópia. `
                + 'Nada foi migrado.');
        }

        return { accounts: contas.length, items: itens.length, paraTras };
    });

    if (resultado.items > 0 || resultado.accounts > 0) {
        log(`✅ Consumos migrados: ${resultado.items} item(ns), ${resultado.accounts} conta(s) de suíte criada(s).`);
    }

    // Depois do commit: as válidas ficam migradas, e o migrate falha alto pelas outras.
    if (resultado.paraTras.length > 0) {
        throw new Error(`migração de consumos: ${resultado.paraTras.length} reserva(s) ficaram para trás por dado `
            + 'inválido (amount fora de 0 a 99999999.99, ou hotel do consumo diferente do da reserva). '
            + 'O bill delas responde 503 até corrigir o dado e rodar o migrate de novo. '
            + `Reservas: ${resultado.paraTras.join(', ')}`);
    }

    return { skipped: false, accounts: resultado.accounts, items: resultado.items };
}
