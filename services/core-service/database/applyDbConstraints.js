import { QueryTypes } from 'sequelize';
import { PRODUCT_CATEGORIES } from '../app/utils/productCategories.js';
import { ACCOUNT_TYPES, ACCOUNT_STATUSES, ITEM_REASONS, ITEM_ORIGINS } from '../app/utils/accountEnums.js';

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

    await applyAccountConstraints(sequelize);
    await applyPaymentAccountConstraints(sequelize);

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
    // Por último: num banco legado com quarto vendido duas vezes, a ocupação recusa criar o
    // EXCLUDE — e isso não pode impedir a cura dos índices e CHECKs acima. Erro guardado e
    // reportado junto com os outros.
    let falhaOutbox = null;
    try {
        await applyOutbox(sequelize);
    } catch (error) {
        falhaOutbox = error;
    }

    let falhaOcupacao = null;
    try {
        await applyRoomOccupancy(sequelize, log);
    } catch (error) {
        falhaOcupacao = error;
    }

    if (falhas.length) {
        const detalhe = falhas
            .map((f) => `  - ${f.tabela} (${f.colunas}) -> ${f.nome}: ${f.motivo}`)
            .join('\n');
        throw new Error(
            `applyDbConstraints: ${falhas.length} índice(s) não puderam ser curados — ` +
            `provavelmente há linhas VIVAS duplicadas nas colunas abaixo, e não é seguro ` +
            `decidir sozinho qual manter:\n${detalhe}\n` +
            `O restante das constraints e índices foi aplicado normalmente.` +
            (falhaOcupacao ? `\n\nOcupação de quartos: ${falhaOcupacao.message}` : '') +
            (falhaOutbox ? `\n\nOutbox: ${falhaOutbox.message}` : '')
        );
    }
    if (falhaOcupacao && falhaOutbox) {
        throw new Error(`${falhaOcupacao.message}\n\nOutbox: ${falhaOutbox.message}`);
    }
    if (falhaOcupacao || falhaOutbox) throw falhaOcupacao ?? falhaOutbox;

    log('✅ Constraints, CHECKs e índices compostos aplicados.');
}

/**
 * Pagamento ligado à conta (T-04.4, CA-04.4.b).
 *
 * - `reservation_id` deixa de ser obrigatório. O DROP NOT NULL é explícito pelo mesmo
 *   motivo do `account_items.created_by`: com FK na coluna, o sync({ alter }) só refaz a
 *   FK e deixa o NOT NULL de um banco anterior.
 * - Todo pagamento tem reserva ou conta.
 * - Trigger payments_account_consistency: pagamento com conta tem a reserva e o tenant
 *   da conta. O banco recusa um pagamento que aponte para a conta de uma reserva e para
 *   outra reserva, ou que deixe a reserva nula na conta da suíte. Trigger, não FK
 *   composta: a FK precisaria de um UNIQUE (id, reservation_id) total em accounts, que a
 *   regra dos paranoid proíbe (tests/db-constraints.test.js), e com MATCH SIMPLE não
 *   pegaria a reserva nula.
 */
async function applyPaymentAccountConstraints(sequelize) {
    await sequelize.query(`
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'payments' AND column_name = 'account_id')
               AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'accounts') THEN
                ALTER TABLE payments ALTER COLUMN reservation_id DROP NOT NULL;

                ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_reservation_or_account;
                ALTER TABLE payments ADD  CONSTRAINT payments_reservation_or_account
                    CHECK (reservation_id IS NOT NULL OR account_id IS NOT NULL);

                CREATE INDEX IF NOT EXISTS idx_payments_account ON payments (account_id);
            END IF;
        END $$;

        CREATE OR REPLACE FUNCTION payments_account_consistency() RETURNS trigger AS $$
        DECLARE
            conta accounts%ROWTYPE;
        BEGIN
            IF NEW.account_id IS NULL THEN
                RETURN NEW;
            END IF;
            SELECT * INTO conta FROM accounts WHERE id = NEW.account_id;
            IF conta.tenant_id IS DISTINCT FROM NEW.tenant_id
               OR conta.reservation_id IS DISTINCT FROM NEW.reservation_id THEN
                RAISE EXCEPTION 'payments_account_consistency: o pagamento precisa ter a reserva e o tenant da conta %', NEW.account_id
                    USING ERRCODE = 'check_violation';
            END IF;
            RETURN NEW;
        END $$ LANGUAGE plpgsql;
    `);

    // Sem lista de colunas ("UPDATE OF ..."): mesma lição do outbox — o sync({ alter })
    // reemite ALTER TYPE e o PostgreSQL recusa em coluna citada num trigger.
    await sequelize.query(`
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'payments' AND column_name = 'account_id') THEN
                DROP TRIGGER IF EXISTS payments_account_consistency ON payments;
                CREATE TRIGGER payments_account_consistency
                    BEFORE INSERT OR UPDATE ON payments
                    FOR EACH ROW EXECUTE FUNCTION payments_account_consistency();
            END IF;
        END $$;
    `);
}

/**
 * Comanda (SPEC-04, T-04.1) — segunda barreira atrás dos 422 dos controllers.
 *
 * As regras de tipo de conta (D-4, D-5) e as financeiras do item viram CHECK: um
 * controller que esqueça uma validação não grava conta de mesa cobrando diária nem item
 * com total divergente de quantidade × preço. Mesmo DROP + ADD dos CHECKs de products,
 * pelo mesmo motivo — a allowlist muda e um CHECK antigo nunca seria atualizado.
 *
 * Mesma ressalva dos demais: se um banco já tiver linha violando a regra, o ADD falha e
 * o migrate para com o nome da constraint. Com as tabelas nascendo nesta tarefa, não há.
 */
async function applyAccountConstraints(sequelize) {
    const lista = (valores) => valores.map((v) => `'${v}'`).join(', ');

    await sequelize.query(`
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'accounts') THEN
                ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_type_allowlist;
                ALTER TABLE accounts ADD  CONSTRAINT accounts_type_allowlist
                    CHECK (type IN (${lista(ACCOUNT_TYPES)}));

                ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_status_allowlist;
                ALTER TABLE accounts ADD  CONSTRAINT accounts_status_allowlist
                    CHECK (status IN (${lista(ACCOUNT_STATUSES)}));

                -- D-4: só a conta da suíte cobra diária; não há diária em mesa, balcão,
                -- day-use nem conta interna.
                ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_charges_lodging_room_only;
                ALTER TABLE accounts ADD  CONSTRAINT accounts_charges_lodging_room_only
                    CHECK (type = 'ROOM' OR charges_lodging = false);

                -- D-5: conta de suíte pertence a uma estadia, a um quarto e a um hóspede.
                ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_room_requires_stay;
                ALTER TABLE accounts ADD  CONSTRAINT accounts_room_requires_stay
                    CHECK (type <> 'ROOM' OR (reservation_id IS NOT NULL AND room_id IS NOT NULL AND guest_id IS NOT NULL));

                -- D-5: só a conta de suíte tem reserva — é o que permite consumo sem hospedagem.
                ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_reservation_only_room;
                ALTER TABLE accounts ADD  CONSTRAINT accounts_reservation_only_room
                    CHECK (type = 'ROOM' OR reservation_id IS NULL);

                -- D-5: mesa aberta ao público e conta interna não têm responsável (MER 4.11).
                ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_no_guest_table_internal;
                ALTER TABLE accounts ADD  CONSTRAINT accounts_no_guest_table_internal
                    CHECK (type NOT IN ('TABLE', 'INTERNAL') OR guest_id IS NULL);

                -- D-39: a diária gravada é do fechamento; conta aberta calcula na hora.
                -- Não exige o contrário (fechada => gravada): as contas fechadas antes da
                -- T-04.3 só recebem o valor no fim do migrate (closeEndedStayAccounts).
                ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_closed_room_charges_only_closed;
                ALTER TABLE accounts ADD  CONSTRAINT accounts_closed_room_charges_only_closed
                    CHECK (status <> 'OPEN' OR closed_room_charges IS NULL);
                ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_closed_room_charges_non_negative;
                ALTER TABLE accounts ADD  CONSTRAINT accounts_closed_room_charges_non_negative
                    CHECK (closed_room_charges IS NULL OR closed_room_charges >= 0);

                CREATE INDEX IF NOT EXISTS idx_accounts_tenant_status ON accounts (tenant_id, status);
                CREATE INDEX IF NOT EXISTS idx_accounts_reservation   ON accounts (reservation_id);
            END IF;

            IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'account_items') THEN
                ALTER TABLE account_items DROP CONSTRAINT IF EXISTS account_items_quantity_positive;
                ALTER TABLE account_items ADD  CONSTRAINT account_items_quantity_positive CHECK (quantity > 0);

                ALTER TABLE account_items DROP CONSTRAINT IF EXISTS account_items_unit_price_non_negative;
                ALTER TABLE account_items ADD  CONSTRAINT account_items_unit_price_non_negative CHECK (unit_price >= 0);

                -- CA-04.1.c no banco. Também implica total >= 0 (MER): quantity > 0 e
                -- unit_price >= 0. Inteiro × NUMERIC(10,2) é exato — sem falso positivo
                -- por arredondamento de centavo.
                ALTER TABLE account_items DROP CONSTRAINT IF EXISTS account_items_total_matches;
                ALTER TABLE account_items ADD  CONSTRAINT account_items_total_matches CHECK (total = quantity * unit_price);

                ALTER TABLE account_items DROP CONSTRAINT IF EXISTS account_items_reason_allowlist;
                ALTER TABLE account_items ADD  CONSTRAINT account_items_reason_allowlist
                    CHECK (reason IS NULL OR reason IN (${lista(ITEM_REASONS)}));

                -- RN-007: cortesia é registrada com motivo, para o relatório gerencial.
                ALTER TABLE account_items DROP CONSTRAINT IF EXISTS account_items_reason_required;
                ALTER TABLE account_items ADD  CONSTRAINT account_items_reason_required
                    CHECK (billable OR reason IS NOT NULL);

                -- D-25: origem do item; só o consumo antigo migrado fica sem autor.
                -- O DROP NOT NULL é explícito porque, com FK na coluna, o sync({ alter })
                -- só refaz a FK e deixa o NOT NULL de um banco anterior à T-04.2.
                ALTER TABLE account_items ALTER COLUMN created_by DROP NOT NULL;
                -- D-26: ninguém consome depois de o lançamento ser gravado. Item anterior à
                -- coluna recebeu o horário do migrate; volta para o created_at. A folga de 1
                -- minuto ignora a diferença de relógio entre a aplicação e o banco, e é a
                -- mesma que a rota antiga aceita no futuro — lançamento válido nunca é tocado.
                -- Só origin ACCOUNT: o consumo antigo migrado guarda o horário que tinha,
                -- inclusive agendado (qa-redteam 19/10, 🟡-1).
                UPDATE account_items SET consumed_at = created_at
                 WHERE origin = 'ACCOUNT' AND created_at IS NOT NULL
                   AND consumed_at > created_at + interval '1 minute';

                ALTER TABLE account_items DROP CONSTRAINT IF EXISTS account_items_origin_allowlist;
                ALTER TABLE account_items ADD  CONSTRAINT account_items_origin_allowlist
                    CHECK (origin IN (${lista(ITEM_ORIGINS)}));

                ALTER TABLE account_items DROP CONSTRAINT IF EXISTS account_items_created_by_required;
                ALTER TABLE account_items ADD  CONSTRAINT account_items_created_by_required
                    CHECK (created_by IS NOT NULL OR origin = 'LEGACY_CONSUMPTION');

                -- RN-008 com a D-6: índice TOTAL, exceção deliberada à regra dos paranoid.
                -- O item excluído continua barrando o reenvio do mesmo client_item_id —
                -- se o índice fosse parcial, a fila offline do garçom recriaria o item
                -- excluído e recobraria o hóspede. Por tenant: o id vem do dispositivo.
                CREATE UNIQUE INDEX IF NOT EXISTS account_items_client_item_tenant_unique
                    ON account_items (tenant_id, client_item_id);

                CREATE INDEX IF NOT EXISTS idx_account_items_account ON account_items (account_id);
            END IF;

            -- Tabela legada (T-04.2, D-27): a checagem do 503 (pendingLegacyConsumption)
            -- roda a cada bill e lista; sem índice era seq scan (reauditoria N-3).
            IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'consumptions') THEN
                CREATE INDEX IF NOT EXISTS idx_consumptions_reservation ON consumptions (reservation_id);
            END IF;
        END $$;
    `);
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
async function applyRoomOccupancy(sequelize, log = () => {}) {
    // A cópia vem SEMPRE da reserva-mãe: ao inserir no pivô e a qualquer UPDATE dele.
    await sequelize.query(`
        CREATE OR REPLACE FUNCTION reservation_rooms_copia_periodo() RETURNS trigger AS $$
        BEGIN
            -- FOR SHARE: se outra transação está alterando a reserva-mãe (datas, status), esperar
            -- ela terminar e copiar o valor CONFIRMADO. Sem isso, um quarto extra inserido
            -- durante uma mudança de datas copiava o período velho — e o EXCLUDE protegia as
            -- datas erradas (achado 🔴-1 do qa-redteam de 10/10, reproduzido).
            SELECT r.check_in_date, r.check_out_date, (r.status <> 'CANCELLED' AND r.deleted_at IS NULL)
              INTO NEW.check_in_date, NEW.check_out_date, NEW.blocks_room
              FROM reservations r
             WHERE r.id = NEW.reservation_id
               FOR SHARE;
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

    // Banco legado: antes desta mudança, trocar o quarto principal pelo PUT não mexia no pivô —
    // o principal ANTIGO ficava lá como se fosse extra, e o novo não entrava. São exatamente as
    // reservas cujo principal falta no pivô mas que têm outras linhas nele. Não dá para saber
    // sozinho qual linha é o principal antigo e qual é um extra de verdade: lista para revisão.
    const [suspeitas] = await sequelize.query(`
        SELECT r.id FROM reservations r
         WHERE r.deleted_at IS NULL AND r.status <> 'CANCELLED'
           AND NOT EXISTS (SELECT 1 FROM reservation_rooms rr WHERE rr.reservation_id = r.id AND rr.room_id = r.room_id)
           AND EXISTS     (SELECT 1 FROM reservation_rooms rr WHERE rr.reservation_id = r.id)
         LIMIT 50
    `);
    if (suspeitas.length > 0) {
        log(
            `⚠️  ${suspeitas.length} reserva(s) tiveram o quarto principal trocado antes desta versão e ` +
            `podem ter o quarto ANTIGO ainda ocupado como extra — confira e remova-o se for o caso ` +
            `(DELETE /reservations/:id/rooms/:roomId): ${suspeitas.map((x) => x.id).join(', ')}`
        );
    }

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

/**
 * Outbox transacional por TRIGGER (T-01.4/H.1, decisão do Gabriel de 14/10) — contrato no catálogo
 * de eventos v1.0 (docs/specs/anexos/SPEC-01-catalogo-eventos.md).
 *
 * Por que no banco, e não nos controllers: são mais de 20 caminhos de escrita nas 6 tabelas
 * (CRUD, check-in/out, cancelamentos, webhook PIX, contrato, reserva pública, escrita em lote).
 * Um que esquecesse de gravar o evento deixaria o analytics divergente sem erro nenhum — o mesmo
 * risco que gerou a P-1. O trigger também cumpre a regra do §6 por construção: é AFTER, então a
 * linha do outbox (e o número da sequência, o aggregate_version) vem DEPOIS da escrita de
 * domínio, sob o lock da linha.
 *
 * Payload: só os campos do §4 — minimização (o hóspede leva só o nome). Dinheiro como texto
 * ("1250.00"), data como "YYYY-MM-DD", instante como ISO-8601 UTC. Uma atualização que não muda
 * nenhum campo do payload não gera evento (ex.: telefone do hóspede, preço da categoria).
 */
async function applyOutbox(sequelize) {
    // Trigger apontando para uma tabela que não existe derruba TODA escrita nas 6 tabelas. O
    // migrate tolera falha no sync — então confere antes e recusa com mensagem clara.
    const [{ existe }] = await sequelize.query(
        "SELECT to_regclass('public.outbox') IS NOT NULL AS existe",
        { type: QueryTypes.SELECT }
    );
    if (!existe) {
        throw new Error('tabela outbox não existe (o sync falhou antes de criá-la) — triggers do outbox NÃO criados');
    }

    await sequelize.query(`
        CREATE OR REPLACE FUNCTION outbox_iso(ts timestamptz) RETURNS text AS $$
            SELECT to_char(ts AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
        $$ LANGUAGE sql IMMUTABLE;

        -- Payload do §4 a partir de uma linha — o mesmo para o estado atual e o anterior.
        CREATE OR REPLACE FUNCTION outbox_payload(agregado text, l jsonb) RETURNS jsonb AS $$
            SELECT CASE agregado
                WHEN 'tenant'        THEN jsonb_build_object('status', l->>'status')
                WHEN 'room_category' THEN jsonb_build_object('name', l->>'name')
                WHEN 'room'          THEN jsonb_build_object('category_id', l->>'category_id', 'number', l->>'number', 'status', l->>'status')
                WHEN 'guest'         THEN jsonb_build_object('full_name', l->>'full_name')
                WHEN 'reservation'   THEN jsonb_build_object(
                    'guest_id', l->>'guest_id', 'room_id', l->>'room_id', 'status', l->>'status',
                    'check_in_date', l->>'check_in_date', 'check_out_date', l->>'check_out_date',
                    'total_amount', l->>'total_amount',
                    'created_at', outbox_iso((l->>'created_at')::timestamptz))
                WHEN 'payment'       THEN jsonb_build_object(
                    'reservation_id', l->>'reservation_id', 'amount', l->>'amount', 'method', l->>'method',
                    'status', l->>'status',
                    'paid_at', CASE WHEN l->>'paid_at' IS NULL THEN NULL ELSE outbox_iso((l->>'paid_at')::timestamptz) END)
            END
        $$ LANGUAGE sql IMMUTABLE;

        CREATE OR REPLACE FUNCTION outbox_grava_evento() RETURNS trigger AS $$
        DECLARE
            novo     jsonb := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END;
            velho    jsonb := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END;
            atual    jsonb := COALESCE(novo, velho);
            agregado text;
            fato     text;
            dados    jsonb;
            tenant   uuid;
        BEGIN
            agregado := CASE TG_TABLE_NAME
                WHEN 'tenants'         THEN 'tenant'
                WHEN 'room_categories' THEN 'room_category'
                WHEN 'rooms'           THEN 'room'
                WHEN 'guests'          THEN 'guest'
                WHEN 'reservations'    THEN 'reservation'
                WHEN 'payments'        THEN 'payment'
            END;
            dados := outbox_payload(agregado, atual);

            IF TG_OP = 'INSERT' THEN
                fato := 'created';
            ELSIF TG_OP = 'DELETE' AND agregado = 'guest' THEN
                -- Hóspede só sai fisicamente do banco por eliminação a pedido do titular (T-06.11):
                -- §4.4 manda guest.erased com payload VAZIO — o nome não pode viajar de novo.
                fato := 'erased';
                dados := '{}'::jsonb;
            ELSIF TG_OP = 'DELETE' THEN
                fato := 'deleted';
            ELSIF velho->>'deleted_at' IS NULL AND novo->>'deleted_at' IS NOT NULL THEN
                fato := 'deleted';                                   -- exclusão lógica (paranoid)
            ELSE
                IF dados = outbox_payload(agregado, velho)
                   AND (velho->>'deleted_at') IS NOT DISTINCT FROM (novo->>'deleted_at') THEN
                    RETURN NULL;                                     -- nada que o analytics use mudou
                END IF;

                IF agregado IN ('reservation', 'payment') AND (velho->>'status') IS DISTINCT FROM (novo->>'status') THEN
                    fato := 'status_changed';
                    dados := dados || jsonb_build_object('previous_status', velho->>'status');
                ELSE
                    fato := 'updated';
                END IF;
            END IF;

            tenant := CASE WHEN agregado = 'tenant' THEN (atual->>'id')::uuid ELSE (atual->>'tenant_id')::uuid END;

            INSERT INTO outbox (event_id, type, version, tenant_id, aggregate_id, payload, occurred_at)
            VALUES (gen_random_uuid(), agregado || '.' || fato, 1, tenant, (atual->>'id')::uuid, dados, now());
            RETURN NULL;
        END $$ LANGUAGE plpgsql;
    `);

    // Sem lista de colunas ("UPDATE OF ..."): o sync({ alter }) do migrate reemite ALTER TYPE a
    // cada execução e o PostgreSQL recusa isso em coluna citada num trigger (lição da etapa F).
    for (const tabela of ['tenants', 'room_categories', 'rooms', 'guests', 'reservations', 'payments']) {
        await sequelize.query(`
            DROP TRIGGER IF EXISTS ${tabela}_outbox ON ${tabela};
            CREATE TRIGGER ${tabela}_outbox
                AFTER INSERT OR UPDATE OR DELETE ON ${tabela}
                FOR EACH ROW EXECUTE FUNCTION outbox_grava_evento();
        `);
    }
}
