// setupFile: roda antes de cada arquivo de teste, no worker de testes.
// Responsabilidade: setar env vars e inicializar relações do Sequelize.
// O schema já foi criado pelo globalSetup — não faz sync aqui.
import dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env.test'), override: true });

// MinIO não existe em teste/CI. Valores fictícios, definidos ANTES de qualquer import do
// cliente S3 (ele lê o ambiente ao ser criado): a porta 9 recusa conexão, então o upload real
// falha e cai no best-effort; e a URL assinada é gerada de verdade — assinar é cálculo local,
// sem rede. Os testes de PDF espionam s3Client.send (tests/quote-pdf.test.js).
// Atribuição, não `??=`: um MINIO_ENDPOINT herdado do shell com o MinIO de dev no ar faria a
// suíte enviar arquivos de verdade ao bucket de dev.
process.env.MINIO_ENDPOINT = 'http://127.0.0.1:9';
process.env.MINIO_PUBLIC_ENDPOINT = 'http://gesway.test:8088';
process.env.MINIO_ROOT_USER = 'teste';
process.env.MINIO_ROOT_PASSWORD = 'teste-segredo';
process.env.MINIO_PRESIGN_USER = 'leitor-teste';
process.env.MINIO_PRESIGN_PASSWORD = 'leitor-teste-segredo';

const { default: initRelations } = await import('../../database/relations.js');

if (!globalThis.__hotelRelationsInit) {
    globalThis.__hotelRelationsInit = true;
    initRelations();
}
