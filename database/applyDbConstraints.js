import { PRODUCT_CATEGORIES } from '../app/utils/productCategories.js';

/**
 * Objetos de banco que o `sequelize.sync()` NÃO gera: extensões, constraints
 * EXCLUDE, CHECKs e índices compostos. As validações `validate:` dos models
 * vivem só na aplicação — o banco não as conhece.
 *
 * Precisa ser chamado pelos DOIS caminhos de provisionamento:
 *   - `command.js migrate`        → banco de desenvolvimento e produção
 *   - `tests/setup/globalSetup.js` → banco de teste (sync({ force: true }))
 *
 * Sem isso o banco de teste diverge do de produção e a suíte passa verde sobre
 * um schema mais permissivo do que o real.
 *
 * Idempotente: pode rodar quantas vezes quiser.
 */
export default async function applyDbConstraints(sequelize, { log = () => {} } = {}) {
    // Índice GiST combinando igualdade + intervalo.
    await sequelize.query('CREATE EXTENSION IF NOT EXISTS btree_gist;');

    // Anti-double-booking em nível de banco: o mesmo quarto não pode ter duas
    // reservas com datas sobrepostas. Proteção independente do código.
    //
    // O predicado WHERE é essencial e faltava. Sem ele a constraint conta reservas
    // CANCELADAS e soft-deletadas: cancelar uma reserva do quarto 101 de 01 a 03/12
    // queimava esse quarto nessas datas PARA SEMPRE. A lógica de aplicação
    // (checkReservationConflict) ignora canceladas e dizia "disponível"; o banco
    // recusava e o usuário recebia 500.
    //
    // Recria só quando o predicado está ausente — evita reconstruir o índice GiST
    // a cada migrate.
    await sequelize.query(`
        DO $$
        DECLARE
            def TEXT;
        BEGIN
            SELECT pg_get_constraintdef(oid) INTO def
              FROM pg_constraint WHERE conname = 'reservations_room_id_daterange_excl';

            IF def IS NULL OR def NOT LIKE '%WHERE%' THEN
                ALTER TABLE reservations DROP CONSTRAINT IF EXISTS reservations_room_id_daterange_excl;
                ALTER TABLE reservations ADD CONSTRAINT reservations_room_id_daterange_excl
                    EXCLUDE USING gist (
                        room_id WITH =,
                        daterange(check_in_date, check_out_date, '[)') WITH &&
                    ) WHERE (status <> 'CANCELLED' AND deleted_at IS NULL);
            END IF;
        END $$;
    `);

    // CHECKs do catálogo. DROP + ADD em vez de IF NOT EXISTS: a allowlist muda
    // quando uma categoria nova entra, e um CHECK criado uma vez e nunca mais
    // atualizado rejeitaria a categoria nova só em produção.
    const categoriasSql = PRODUCT_CATEGORIES.map(c => `'${c}'`).join(', ');
    await sequelize.query(`
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'products') THEN
                ALTER TABLE products DROP CONSTRAINT IF EXISTS products_price_non_negative;
                ALTER TABLE products ADD  CONSTRAINT products_price_non_negative CHECK (price >= 0);

                ALTER TABLE products DROP CONSTRAINT IF EXISTS products_category_allowlist;
                ALTER TABLE products ADD  CONSTRAINT products_category_allowlist
                    CHECK (category IN (${categoriasSql}));
            END IF;
        END $$;
    `);

    // Índices compostos (tenant_id primeiro) das consultas críticas.
    await sequelize.query('CREATE INDEX IF NOT EXISTS idx_reservations_tenant_checkin ON reservations (tenant_id, check_in_date);');
    await sequelize.query('CREATE INDEX IF NOT EXISTS idx_rooms_tenant_status         ON rooms (tenant_id, status);');
    await sequelize.query('CREATE INDEX IF NOT EXISTS idx_users_tenant_email          ON users (tenant_id, email);');
    await sequelize.query('CREATE INDEX IF NOT EXISTS idx_reservation_rooms_res_id    ON reservation_rooms (reservation_id);');

    log('✅ Constraints, CHECKs e índices compostos aplicados.');
}
