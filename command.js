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

        // Sequelize sync não cria EXCLUDE constraints nem índices compostos definidos
        // apenas no schema.sql. Aplicamos aqui para garantir consistência em todo deploy.
        await sequelize.query('CREATE EXTENSION IF NOT EXISTS btree_gist');

        await sequelize.query(`
            DO $$ BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint
                    WHERE conrelid = 'reservations'::regclass AND contype = 'x'
                ) THEN
                    ALTER TABLE reservations ADD CONSTRAINT reservations_no_overlap
                        EXCLUDE USING gist (
                            room_id WITH =,
                            daterange(check_in_date, check_out_date, '[)') WITH &&
                        );
                END IF;
            END $$;
        `);

        await sequelize.query('CREATE INDEX IF NOT EXISTS idx_reservations_tenant_checkin ON reservations (tenant_id, check_in_date)');
        await sequelize.query('CREATE INDEX IF NOT EXISTS idx_rooms_tenant_status         ON rooms (tenant_id, status)');
        await sequelize.query('CREATE INDEX IF NOT EXISTS idx_users_tenant_email          ON users (tenant_id, email)');
        await sequelize.query('CREATE INDEX IF NOT EXISTS idx_reservation_rooms_res_id    ON reservation_rooms (reservation_id)');

        console.log('✅ Constraint de exclusão e índices de performance aplicados.');
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
