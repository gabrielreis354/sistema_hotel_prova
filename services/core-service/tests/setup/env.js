// setupFile: roda antes de cada arquivo de teste, no worker de testes.
// Responsabilidade: setar env vars e inicializar relações do Sequelize.
// O schema já foi criado pelo globalSetup — não faz sync aqui.
import dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env.test'), override: true });

const { default: initRelations } = await import('../../database/relations.js');

if (!globalThis.__hotelRelationsInit) {
    globalThis.__hotelRelationsInit = true;
    initRelations();
}
