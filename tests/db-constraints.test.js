import { describe, it, expect } from 'vitest';
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
