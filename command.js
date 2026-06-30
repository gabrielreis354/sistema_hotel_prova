import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const command = process.argv[2];

async function migrate() {
    const { default: sequelize } = await import('./database/connections/sequelize.js');
    const { default: initRelations } = await import('./database/relations.js');

    initRelations();

    try {
        await sequelize.authenticate();
        console.log('✅ Conexão com o banco de dados estabelecida.');

        await sequelize.sync({ alter: true });
        console.log('✅ Migrations executadas com sucesso. Todas as tabelas estão atualizadas.');

        // Objetos que o Sequelize não gerencia nativamente, aplicados de forma idempotente
        // para o banco vivo bater com db/schema.sql:
        //  - btree_gist: habilita índice GiST combinando igualdade + intervalo
        //  - EXCLUDE constraint: anti-double-booking em nível de banco (mesmo quarto não
        //    pode ter duas reservas com datas sobrepostas) — proteção independente do código
        //  - índices compostos (tenant_id primeiro) que otimizam as consultas críticas
        await sequelize.query('CREATE EXTENSION IF NOT EXISTS btree_gist;');
        await sequelize.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'reservations_room_id_daterange_excl'
                ) THEN
                    ALTER TABLE reservations ADD CONSTRAINT reservations_room_id_daterange_excl
                        EXCLUDE USING gist (
                            room_id WITH =,
                            daterange(check_in_date, check_out_date, '[)') WITH &&
                        );
                END IF;
            END $$;
        `);
        await sequelize.query('CREATE INDEX IF NOT EXISTS idx_reservations_tenant_checkin ON reservations (tenant_id, check_in_date);');
        await sequelize.query('CREATE INDEX IF NOT EXISTS idx_rooms_tenant_status         ON rooms (tenant_id, status);');
        await sequelize.query('CREATE INDEX IF NOT EXISTS idx_users_tenant_email          ON users (tenant_id, email);');
        await sequelize.query('CREATE INDEX IF NOT EXISTS idx_reservation_rooms_res_id    ON reservation_rooms (reservation_id);');
        console.log('✅ Constraint de exclusão (anti-double-booking) e índices compostos aplicados.');
    } catch (error) {
        console.error('❌ Erro ao executar migrations:', error.message);
        process.exit(1);
    } finally {
        await sequelize.close();
        process.exit(0);
    }
}

if (command === 'migrate') {
    migrate();
} else {
    console.log('Uso:');
    console.log('  node command.js migrate    — cria/atualiza todas as tabelas no banco de dados');
    process.exit(1);
}
