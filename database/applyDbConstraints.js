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

    // Índices únicos PARCIAIS em models paranoid — mesmo mecanismo da EXCLUDE acima,
    // agora para os 7 índices auditados no PASSO 2 da SPEC-06 (users, room_categories,
    // rooms, guests ×2, corporate_clients ×2).
    //
    // Por que isto é necessário e o model/schema.sql sozinhos NÃO bastam:
    //   - `sequelize.sync({ alter: true })` (usado por `command.js migrate`) compara
    //     índice por NOME. Um banco provisionado antes desta correção já tem um índice
    //     com o mesmo nome canônico (ex.: `users_email_tenant_unique`), só que TOTAL —
    //     o sync vê o nome existir e não mexe. `alter` nunca troca a definição.
    //   - `db/schema.sql` usava `UNIQUE (...)` DE TABELA. Um banco provisionado pelo
    //     schema.sql antigo tem essa constraint sob um nome autogerado pelo Postgres
    //     (ex.: `guests_tenant_id_cpf_key`) — diferente do nome canônico, então o
    //     `CREATE UNIQUE INDEX IF NOT EXISTS` do schema.sql novo cria o parcial AO LADO
    //     da constraint antiga, que continua barrando a recriação.
    //
    // A detecção por isso não pode confiar em nome: procura, para cada tabela, QUALQUER
    // índice único sobre exatamente aquele conjunto de colunas (nome e ordem
    // irrelevantes) que não tenha o predicado `deleted_at IS NULL`, e remove — via
    // DROP CONSTRAINT se for backing de uma constraint (UNIQUE de tabela), via DROP
    // INDEX se for um índice solto (o que o Sequelize cria). Só depois cria o parcial
    // canônico. Idempotente: roda sempre, sem custo em banco já correto.
    const indicesParciais = [
        { tabela: 'users',              colunas: ['email', 'tenant_id'],   nome: 'users_email_tenant_unique' },
        { tabela: 'room_categories',    colunas: ['tenant_id', 'name'],    nome: 'room_categories_name_tenant_unique' },
        { tabela: 'rooms',              colunas: ['tenant_id', 'number'],  nome: 'rooms_number_tenant_unique' },
        { tabela: 'guests',             colunas: ['cpf', 'tenant_id'],     nome: 'guests_cpf_tenant_unique' },
        { tabela: 'guests',             colunas: ['email', 'tenant_id'],   nome: 'guests_email_tenant_unique' },
        { tabela: 'corporate_clients',  colunas: ['cnpj', 'tenant_id'],    nome: 'corporate_clients_cnpj_tenant_unique' },
        { tabela: 'corporate_clients',  colunas: ['cpf', 'tenant_id'],     nome: 'corporate_clients_cpf_tenant_unique' }
    ];

    for (const { tabela, colunas, nome } of indicesParciais) {
        const colunasOrdenadas = [...colunas].sort();
        const arrayLiteral = 'ARRAY[' + colunasOrdenadas.map((c) => `'${c}'`).join(',') + ']::name[]';
        const colunasCreate = colunas.join(', ');

        await sequelize.query(`
            DO $$
            DECLARE
                idx RECORD;
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = '${tabela}') THEN
                    RETURN;
                END IF;

                FOR idx IN
                    SELECT ix.indexrelid::regclass::text AS indexname, con.conname AS conname
                    FROM pg_index ix
                    JOIN pg_class t ON t.oid = ix.indrelid
                    LEFT JOIN pg_constraint con ON con.conindid = ix.indexrelid
                    WHERE t.relname = '${tabela}'
                      AND ix.indisunique
                      AND (
                          SELECT array_agg(a.attname ORDER BY a.attname)
                          FROM pg_attribute a
                          WHERE a.attrelid = ix.indrelid AND a.attnum = ANY(ix.indkey)
                      ) = ${arrayLiteral}
                      AND pg_get_indexdef(ix.indexrelid) NOT ILIKE '%deleted_at IS NULL%'
                LOOP
                    IF idx.conname IS NOT NULL THEN
                        EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', '${tabela}', idx.conname);
                    ELSE
                        EXECUTE format('DROP INDEX %I', idx.indexname);
                    END IF;
                END LOOP;

                IF NOT EXISTS (
                    SELECT 1 FROM pg_indexes
                    WHERE schemaname = 'public' AND tablename = '${tabela}' AND indexname = '${nome}'
                ) THEN
                    EXECUTE 'CREATE UNIQUE INDEX ${nome} ON ${tabela} (${colunasCreate}) WHERE deleted_at IS NULL';
                END IF;
            END $$;
        `);
    }

    // Índices compostos (tenant_id primeiro) das consultas críticas.
    await sequelize.query('CREATE INDEX IF NOT EXISTS idx_reservations_tenant_checkin ON reservations (tenant_id, check_in_date);');
    await sequelize.query('CREATE INDEX IF NOT EXISTS idx_rooms_tenant_status         ON rooms (tenant_id, status);');
    await sequelize.query('CREATE INDEX IF NOT EXISTS idx_users_tenant_email          ON users (tenant_id, email);');
    await sequelize.query('CREATE INDEX IF NOT EXISTS idx_reservation_rooms_res_id    ON reservation_rooms (reservation_id);');

    log('✅ Constraints, CHECKs e índices compostos aplicados.');
}
