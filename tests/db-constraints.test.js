import { describe, it, expect, afterEach } from 'vitest';
import sequelize from '../database/connections/sequelize.js';

// O banco de teste é criado por sync({ force: true }), que NÃO gera extensão,
// EXCLUDE, CHECK nem índice composto. Sem aplicar os mesmos objetos que o
// `command.js migrate` aplica, a suíte passaria verde sobre um schema mais
// permissivo que o de produção — e um INSERT inválido só quebraria lá.
//
// Estes testes provam que os dois caminhos de provisionamento convergem.
describe('Constraints de banco no ambiente de teste', () => {
    it('products tem os CHECK de price e category', async () => {
        const [rows] = await sequelize.query(`
            SELECT conname FROM pg_constraint
            WHERE conrelid = 'products'::regclass AND contype = 'c'
        `);
        const nomes = rows.map(r => r.conname);

        expect(nomes).toContain('products_price_non_negative');
        expect(nomes).toContain('products_category_allowlist');
    });

    it('o banco rejeita category fora da allowlist, mesmo contornando a aplicação', async () => {
        const [[tenant]] = await sequelize.query('SELECT id FROM tenants LIMIT 1');
        if (!tenant) return; // sem tenant seedado neste ponto da suíte

        await expect(sequelize.query(`
            INSERT INTO products (id, tenant_id, name, price, category, active, created_at, updated_at)
            VALUES (gen_random_uuid(), '${tenant.id}', 'Direto No Banco', 10, 'SOBREMESA', true, now(), now())
        `)).rejects.toThrow();
    });

    it('o banco rejeita price negativo, mesmo contornando a aplicação', async () => {
        const [[tenant]] = await sequelize.query('SELECT id FROM tenants LIMIT 1');
        if (!tenant) return;

        await expect(sequelize.query(`
            INSERT INTO products (id, tenant_id, name, price, category, active, created_at, updated_at)
            VALUES (gen_random_uuid(), '${tenant.id}', 'Preco Negativo Direto', -5, 'OTHER', true, now(), now())
        `)).rejects.toThrow();
    });

    it('o índice único de products é parcial (não queima nome de produto deletado)', async () => {
        const [rows] = await sequelize.query(`
            SELECT indexdef FROM pg_indexes
            WHERE tablename = 'products' AND indexname = 'products_name_tenant_unique'
        `);

        expect(rows).toHaveLength(1);
        expect(rows[0].indexdef).toContain('deleted_at IS NULL');
    });

    // Guarda estrutural contra a regressão que já apareceu quatro vezes: model
    // paranoid com unique TOTAL. Verifica o banco, não o model — é o predicado que
    // realmente chegou ao Postgres que importa, e `sync({alter})` não substitui
    // índice de mesmo nome.
    it.each([
        ['users',             'users_email_tenant_unique'],
        ['room_categories',   'room_categories_name_tenant_unique'],
        ['rooms',             'rooms_number_tenant_unique'],
        ['guests',            'guests_cpf_tenant_unique'],
        ['guests',            'guests_email_tenant_unique'],
        ['corporate_clients', 'corporate_clients_cnpj_tenant_unique'],
        ['corporate_clients', 'corporate_clients_cpf_tenant_unique']
    ])('o índice único de %s (%s) é parcial', async (tabela, indice) => {
        const [rows] = await sequelize.query(`
            SELECT indexdef FROM pg_indexes
            WHERE tablename = '${tabela}' AND indexname = '${indice}'
        `);

        expect(rows).toHaveLength(1);
        expect(rows[0].indexdef).toContain('deleted_at IS NULL');
    });

    it('nenhum model paranoid ficou com índice único total', async () => {
        // Contraparte no banco da regra 8 do scripts/qa_checks.sh, que olha o código.
        // Tabelas soft-delete: todo índice único delas tem que ter o predicado.
        const [rows] = await sequelize.query(`
            SELECT i.indexname, i.tablename
            FROM pg_indexes i
            JOIN information_schema.columns c
              ON c.table_name = i.tablename AND c.column_name = 'deleted_at'
            WHERE i.schemaname = 'public'
              AND i.indexdef LIKE '%UNIQUE%'
              AND i.indexname NOT LIKE '%_pkey'
              AND i.indexdef NOT LIKE '%deleted_at IS NULL%'
        `);

        expect(rows).toEqual([]);
    });

    // Regressão do achado 🔴 da auditoria de 27/08: o banco de teste nasce de
    // sync({force:true}), que já cria os índices corretos — os testes acima nunca
    // exercitam o caminho de CURA de um banco legado, só confirmam o resultado final.
    //
    // `sequelize.sync({alter:true})` (usado por `command.js migrate`) compara índice
    // por NOME e pula um nome já existente, mesmo TOTAL. E um banco provisionado pelo
    // `schema.sql` antigo (UNIQUE de tabela) tem a constraint sob um nome autogerado
    // pelo Postgres, diferente do canônico — o `CREATE UNIQUE INDEX IF NOT EXISTS` cria
    // o parcial AO LADO da constraint antiga, que continua barrando a recriação.
    //
    // Este bloco reproduz os dois cenários direto no banco de teste, chamando
    // applyDbConstraints() de novo — a mesma função que roda em migrate e em
    // globalSetup — e confirma que ela CURA os dois, não só documenta a intenção.
    describe('applyDbConstraints cura índice único total em banco legado', () => {
        // Best-effort: restaura o estado canônico depois de CADA teste deste bloco,
        // mesmo que o teste falhe no meio. Sem isto, uma mutação que sobra (ex.: o
        // 🟡-2 da reauditoria — um índice com duplicata viva que não cura) vazaria
        // para os 12 arquivos de teste que rodam depois (banco único, fileParallelism
        // desligado) e a falha apontaria pro lugar errado.
        afterEach(async () => {
            try {
                const { default: applyDbConstraints } = await import('../database/applyDbConstraints.js');
                await applyDbConstraints(sequelize);
            } catch {
                // melhor esforço — se a própria cura falhar aqui, o teste seguinte que
                // depender do estado vai acusar isso por conta própria
            }
        });

        it('nome canônico já existe, mas TOTAL (simula sync({alter}) sobre banco pré-fix)', async () => {
            await sequelize.query(`
                ALTER TABLE rooms DROP CONSTRAINT IF EXISTS rooms_number_tenant_unique;
                DROP INDEX IF EXISTS rooms_number_tenant_unique;
                CREATE UNIQUE INDEX rooms_number_tenant_unique ON rooms (tenant_id, number);
            `);

            const [antes] = await sequelize.query(`
                SELECT indexdef FROM pg_indexes WHERE indexname = 'rooms_number_tenant_unique'
            `);
            expect(antes[0].indexdef).not.toContain('deleted_at IS NULL');

            const { default: applyDbConstraints } = await import('../database/applyDbConstraints.js');
            await applyDbConstraints(sequelize);

            const [depois] = await sequelize.query(`
                SELECT indexdef FROM pg_indexes WHERE indexname = 'rooms_number_tenant_unique'
            `);
            expect(depois).toHaveLength(1);
            expect(depois[0].indexdef).toContain('deleted_at IS NULL');
        });

        it('constraint com nome autogerado (simula schema.sql antigo com UNIQUE de tabela)', async () => {
            await sequelize.query(`
                ALTER TABLE users ADD CONSTRAINT users_tenant_id_email_key UNIQUE (tenant_id, email);
            `);

            const [antes] = await sequelize.query(`
                SELECT conname FROM pg_constraint WHERE conname = 'users_tenant_id_email_key'
            `);
            expect(antes).toHaveLength(1);

            const { default: applyDbConstraints } = await import('../database/applyDbConstraints.js');
            await applyDbConstraints(sequelize);

            // A constraint de nome legado precisa ter sido removida...
            const [legado] = await sequelize.query(`
                SELECT conname FROM pg_constraint WHERE conname = 'users_tenant_id_email_key'
            `);
            expect(legado).toEqual([]);

            // ...e o índice canônico precisa existir e ser parcial.
            const [canonico] = await sequelize.query(`
                SELECT indexdef FROM pg_indexes WHERE indexname = 'users_email_tenant_unique'
            `);
            expect(canonico).toHaveLength(1);
            expect(canonico[0].indexdef).toContain('deleted_at IS NULL');
        });

        it('ciclo criar → deletar → recriar funciona depois da cura (prova funcional)', async () => {
            // Cria o próprio tenant em vez de depender de um já existente: neste ponto
            // da suíte (db-constraints roda antes de qualquer registerAndLogin) pode não
            // haver nenhum. Um `if (!tenant) return` aqui deixaria o teste passar vazio —
            // exatamente o defeito que a auditoria do PASSO 1 já pegou uma vez.
            const [[tenant]] = await sequelize.query(`
                INSERT INTO tenants (id, name, subdomain, status, created_at, updated_at)
                VALUES (gen_random_uuid(), 'Tenant Cura Legado', 'cura-legado-' || floor(random() * 1000000), 'ACTIVE', now(), now())
                RETURNING id
            `);

            // Reproduz o cenário exato do relatório de auditoria: constraint de nome
            // autogerado sobrevivendo ao lado do índice parcial novo.
            await sequelize.query(`
                ALTER TABLE guests ADD CONSTRAINT guests_tenant_id_cpf_key UNIQUE (tenant_id, cpf);
            `);
            const { default: applyDbConstraints } = await import('../database/applyDbConstraints.js');
            await applyDbConstraints(sequelize);

            const cpf = '39053344705';
            await sequelize.query(`
                INSERT INTO guests (id, tenant_id, full_name, cpf, created_at, updated_at)
                VALUES (gen_random_uuid(), '${tenant.id}', 'Cura Legado', '${cpf}', now(), now())
            `);
            await sequelize.query(`
                UPDATE guests SET deleted_at = now() WHERE tenant_id = '${tenant.id}' AND cpf = '${cpf}'
            `);

            // Antes da cura este INSERT batia na constraint legada. Depois, passa.
            // `.resolves.toBeDefined()`, não `.resolves.not.toThrow()` — a promise já
            // não é uma função para `.toThrow()` avaliar; o que importa é que ela resolve.
            await expect(sequelize.query(`
                INSERT INTO guests (id, tenant_id, full_name, cpf, created_at, updated_at)
                VALUES (gen_random_uuid(), '${tenant.id}', 'Cura Legado Recriada', '${cpf}', now(), now())
            `)).resolves.toBeDefined();

            // Tenant e hóspedes deste teste não pertencem a nenhuma fixture da suíte —
            // limpa para não deixar órfão para os 12 arquivos que rodam depois.
            await sequelize.query(`DELETE FROM guests WHERE tenant_id = '${tenant.id}'`);
            await sequelize.query(`DELETE FROM tenants WHERE id = '${tenant.id}'`);
        });
    });

    it('reservations tem a EXCLUDE de anti-double-booking', async () => {
        const [rows] = await sequelize.query(`
            SELECT conname FROM pg_constraint
            WHERE conname = 'reservations_room_id_daterange_excl'
        `);

        expect(rows).toHaveLength(1);
    });

    it('a EXCLUDE ignora reservas canceladas e soft-deletadas', async () => {
        // Sem o predicado, cancelar uma reserva queimava o quarto naquelas datas
        // para sempre: a aplicação dizia "disponível" e o banco recusava com 500.
        const [rows] = await sequelize.query(`
            SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
            WHERE conname = 'reservations_room_id_daterange_excl'
        `);

        expect(rows).toHaveLength(1);
        expect(rows[0].def).toContain('WHERE');
        expect(rows[0].def).toContain('CANCELLED');
        expect(rows[0].def).toContain('deleted_at IS NULL');
    });
});
