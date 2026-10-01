import { S3Client } from '@aws-sdk/client-s3';

const config = (endpoint) => ({
    endpoint,
    region: 'us-east-1',
    credentials: {
        accessKeyId: process.env.MINIO_ROOT_USER,
        secretAccessKey: process.env.MINIO_ROOT_PASSWORD,
    },
    forcePathStyle: true,
});

// Cliente de operação (upload, bucket): fala com o MinIO pela rede interna.
export default new S3Client(config(process.env.MINIO_ENDPOINT));

// Cliente só para ASSINAR URLs de download (RNF-023). O host faz parte da assinatura: assinada
// com o endereço interno (minio:9000), a URL é inalcançável pelo navegador — o MinIO não é
// exposto. Com MINIO_PUBLIC_ENDPOINT (o endereço pelo qual o navegador chega ao nginx), a URL
// passa pelo nginx, que repassa o Host intacto ao MinIO. Assinar é cálculo local: este cliente
// nunca abre conexão. Sem a variável (backend rodando fora do compose, com o MinIO publicado
// em localhost), o endereço interno já é o alcançável.
export const presignClient = new S3Client(config(process.env.MINIO_PUBLIC_ENDPOINT || process.env.MINIO_ENDPOINT));
