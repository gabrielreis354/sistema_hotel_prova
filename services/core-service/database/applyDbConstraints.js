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

    await applyRoomOccupancy(sequelize);

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
    // agora para os 8 índices auditados na SPEC-06 (users, room_categories, rooms,
    // guests ×2, corporate_clients ×2, products — este último faltou na primeira
    // versão, achado 🟡-1 da auditoria de 21/09: era a tabela que originou a T-06.6,
    // e um banco legado com products já provisionado nunca era curado).
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
        { tabela: 'corporate_clients',  colunas: ['cpf', 'tenant_id'],     nome: 'corporate_clients_cpf_tenant_unique' },
        { tabela: 'products',           colunas: ['name', 'tenant_id'],    nome: 'products_name_tenant_unique' }
    ];

    // Índice a índice, não tudo-ou-nada: um índice que falhe (duplicata viva legada
    // nas colunas — ver comentário do catch abaixo) não pode impedir a cura dos outros
    // 6, nem dos índices compostos de performance logo depois deste laço. Falhas são
    // acumuladas e relançadas ao final, com tabela+colunas+índice de cada uma — Fail
    // Fast na *reportagem*, mas Fail Safe na *execução*: o resto do banco sai curado.
    const falhas = [];
    for (const { tabela, colunas, nome } of indicesParciais) {
        const colunasOrdenadas = [...colunas].sort();
        const arrayLiteral = 'ARRAY[' + colunasOrdenadas.map((c) => `'${c}'`).join(',') + ']::name[]';
        const colunasCreate = colunas.join(', ');

        try {
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
        } catch (erro) {
            // Só chega aqui se houver DUAS OU MAIS linhas VIVAS já violando a unicidade
            // nas colunas certas — algo que só existe em banco legado com dado real
            // incorreto. Não é seguro decidir sozinho qual linha é a "certa" para
            // manter, então isto não fica menos protegido do que estava: o índice
            // antigo (se havia um) só é removido dentro do mesmo DO $$, então se o
            // CREATE final falhar a transação da statement inteira desfaz o DROP junto.
            // `erro.original.message` ("could not create unique index...") é mais específico
            // que `erro.message` ("Validation error") e, ao contrário de `erro.original.detail`,
            // NÃO carrega o valor duplicado (CPF/e-mail) — só o `.detail` traria a PII.
            falhas.push({ tabela, colunas: colunasCreate, nome, motivo: erro.original?.message ?? erro.message });
        }
    }

    // Índices compostos (tenant_id primeiro) das consultas críticas. Rodam mesmo se
    // algum índice parcial acima falhou — são independentes, não há motivo para o
    // banco ficar sem eles por causa de uma duplicata legada em outra tabela.
    await sequelize.query('CREATE INDEX IF NOT EXISTS idx_reservations_tenant_checkin ON reservations (tenant_id, check_in_date);');
    await sequelize.query('CREATE INDEX IF NOT EXISTS idx_rooms_tenant_status         ON rooms (tenant_id, status);');
    await sequelize.query('CREATE INDEX IF NOT EXISTS idx_users_tenant_email          ON users (tenant_id, email);');
    await sequelize.query('CREATE INDEX IF NOT EXISTS idx_reservation_rooms_res_id    ON reservation_rooms (reservation_id);');

    // Só agora, com todo o resto do banco já curado, reportamos o que não pôde ser
    // resolvido sozinho — mensagem com tabela + colunas + índice, para o operador
    // saber exatamente onde olhar (`SELECT tenant_id, <colunas> FROM <tabela> GROUP BY
    // ... HAVING count(*) > 1`), sem expor o valor conflitante (pode ser CPF/e-mail).
    if (falhas.length) {
        const detalhe = falhas
            .map((f) => `  - ${f.tabela} (${f.colunas}) -> ${f.nome}: ${f.motivo}`)
            .join('\n');
        throw new Error(
            `applyDbConstraints: ${falhas.length} índice(s) não puderam ser curados — ` +
            `provavelmente há linhas VIVAS duplicadas nas colunas abaixo, e não é seguro ` +
            `decidir sozinho qual manter:\n${detalhe}\n` +
            `O restante das constraints e índices foi aplicado normalmente.`
        );
    }

    log('✅ Constraints, CHECKs e índices compostos aplicados.');
}

/**
 * Ocupação de quarto com garantia de banco para TODOS os quartos de uma reserva (P-1, rodada 3).
 *
 * O EXCLUDE de `reservations` só enxerga `reservations.room_id`. Os quartos extras de uma
 * reserva (e os 2..N de uma reserva-bloco B2B) vivem só em `reservation_rooms` — e eram
 * vendidos duas vezes. Aqui o pivô vira a fonte única de ocupação:
 *
 *   - `reservation_rooms` guarda uma CÓPIA do período e de "bloqueia o quarto" da reserva;
 *   - a cópia é mantida por TRIGGERS, não pelos controllers: um controller que esqueça de
 *     sincronizar foi exatamente o que causou a P-1 (decisão do Gabriel, 10/10);
 *   - o quarto principal entra no pivô pelo próprio banco, ao criar ou trocar o `room_id`;
 *   - um EXCLUDE no pivô, com o MESMO predicado do de `reservations` (que continua, como
 *     segunda barreira), recusa sobreposição mesmo sob concorrência.
 *
 * Idempotente. Falha com mensagem clara se um banco legado já tiver quartos vendidos duas
 * vezes — o EXCLUDE não pode ser criado sobre dado que o viola.
 */
async function applyRoomOccupancy(sequelize) {
    // A cópia vem SEMPRE da reserva-mãe: ao inserir no pivô e a qualquer UPDATE dele.
    await sequelize.query(`
        CREATE OR REPLACE FUNCTION reservation_rooms_copia_periodo() RETURNS trigger AS $$
        BEGIN
            SELECT r.check_in_date, r.check_out_date, (r.status <> 'CANCELLED' AND r.deleted_at IS NULL)
              INTO NEW.check_in_date, NEW.check_out_date, NEW.blocks_room
              FROM reservations r
             WHERE r.id = NEW.reservation_id;
            RETURN NEW;
        END $$ LANGUAGE plpgsql;

        DROP TRIGGER IF EXISTS reservation_rooms_copia_periodo ON reservation_rooms;
        CREATE TRIGGER reservation_rooms_copia_periodo
            BEFORE INSERT OR UPDATE ON reservation_rooms
            FOR EACH ROW EXECUTE FUNCTION reservation_rooms_copia_periodo();
    `);

    // A reserva propaga para o pivô: o quarto principal entra (ou é trocado) e o período e o
    // status são recopiados — o UPDATE abaixo dispara o BEFORE UPDATE acima, que relê a mãe.
    await sequelize.query(`
        CREATE OR REPLACE FUNCTION reservations_sincroniza_quartos() RETURNS trigger AS $$
        BEGIN
            -- Só o que afeta a ocupação. A comparação fica aqui, e não numa lista
            -- "UPDATE OF col" no trigger: o sync({ alter: true }) do migrate reemite
            -- ALTER COLUMN ... TYPE a cada execução, e o PostgreSQL recusa isso em coluna
            -- citada na definição de um trigger (o 2º migrate quebrava).
            IF TG_OP = 'UPDATE'
               AND NEW.room_id        IS NOT DISTINCT FROM OLD.room_id
               AND NEW.check_in_date  IS NOT DISTINCT FROM OLD.check_in_date
               AND NEW.check_out_date IS NOT DISTINCT FROM OLD.check_out_date
               AND NEW.status         IS NOT DISTINCT FROM OLD.status
               AND NEW.deleted_at     IS NOT DISTINCT FROM OLD.deleted_at THEN
                RETURN NEW;
            END IF;

            IF TG_OP = 'UPDATE' AND NEW.room_id IS DISTINCT FROM OLD.room_id THEN
                DELETE FROM reservation_rooms WHERE reservation_id = NEW.id AND room_id = OLD.room_id;
            END IF;

            INSERT INTO reservation_rooms (id, reservation_id, room_id, created_at, updated_at)
            SELECT gen_random_uuid(), NEW.id, NEW.room_id, now(), now()
             WHERE NOT EXISTS (
                SELECT 1 FROM reservation_rooms WHERE reservation_id = NEW.id AND room_id = NEW.room_id
             );

            IF TG_OP = 'UPDATE' THEN
                UPDATE reservation_rooms SET updated_at = now() WHERE reservation_id = NEW.id;
            END IF;
            RETURN NEW;
        END $$ LANGUAGE plpgsql;

        DROP TRIGGER IF EXISTS reservations_sincroniza_quartos ON reservations;
        CREATE TRIGGER reservations_sincroniza_quartos
            AFTER INSERT OR UPDATE ON reservations
            FOR EACH ROW EXECUTE FUNCTION reservations_sincroniza_quartos();
    `);

    // Banco legado: reservas sem o quarto principal no pivô (o seed insere assim) e linhas de
    // pivô anteriores às colunas copiadas. O UPDATE dispara o trigger que preenche a cópia.
    await sequelize.query(`
        INSERT INTO reservation_rooms (id, reservation_id, room_id, created_at, updated_at)
        SELECT gen_random_uuid(), r.id, r.room_id, now(), now()
          FROM reservations r
         WHERE NOT EXISTS (
            SELECT 1 FROM reservation_rooms rr WHERE rr.reservation_id = r.id AND rr.room_id = r.room_id
         );
        UPDATE reservation_rooms SET updated_at = updated_at WHERE check_in_date IS NULL OR blocks_room IS NULL;
    `);

    const [jaExiste] = await sequelize.query(
        `SELECT 1 FROM pg_constraint WHERE conname = 'reservation_rooms_room_daterange_excl'`
    );
    if (jaExiste.length > 0) return;

    const [conflitos] = await sequelize.query(`
        SELECT a.room_id, a.reservation_id AS reserva_a, b.reservation_id AS reserva_b
          FROM reservation_rooms a
          JOIN reservation_rooms b
            ON a.room_id = b.room_id AND a.id < b.id
           AND a.blocks_room AND b.blocks_room
           AND daterange(a.check_in_date, a.check_out_date, '[)') && daterange(b.check_in_date, b.check_out_date, '[)')
         LIMIT 20
    `);
    if (conflitos.length > 0) {
        const lista = conflitos.map((c) => `quarto ${c.room_id}: reservas ${c.reserva_a} e ${c.reserva_b}`).join('\n  ');
        throw new Error(
            'Não consegui criar a garantia anti-double-booking do pivô: o banco já tem quartos vendidos ' +
            `duas vezes (até 20 casos):\n  ${lista}\nResolva (cancele ou troque o quarto de uma das reservas) e rode o migrate de novo.`
        );
    }

    await sequelize.query(`
        ALTER TABLE reservation_rooms ADD CONSTRAINT reservation_rooms_room_daterange_excl
            EXCLUDE USING gist (
                room_id WITH =,
                daterange(check_in_date, check_out_date, '[)') WITH &&
            ) WHERE (blocks_room);
    `);
}
