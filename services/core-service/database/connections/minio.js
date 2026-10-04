import { S3Client } from '@aws-sdk/client-s3';

const client = (endpoint, accessKeyId, secretAccessKey) => new S3Client({
    endpoint,
    region: 'us-east-1',
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
});

// Cliente de operação (upload, bucket), com a credencial root: fala com o MinIO pela rede interna.
export default client(process.env.MINIO_ENDPOINT, process.env.MINIO_ROOT_USER, process.env.MINIO_ROOT_PASSWORD);

// Cliente só para ASSINAR URLs de download (RNF-023). Duas diferenças, as duas de segurança:
//
// 1. Endereço público (MINIO_PUBLIC_ENDPOINT): o host faz parte da assinatura, e o navegador só
//    alcança o MinIO pelo nginx. Assinada com o interno (minio:9000), a URL não abre.
// 2. Credencial própria (MINIO_PRESIGN_USER), que só tem s3:GetObject (infra/k8s/minio-setup.sh):
//    a URL entregue ao navegador expõe o access key de quem assinou, e o caminho até o MinIO
//    está aberto pelo nginx. NUNCA assinar com o root — por isso não há fallback para ele.
//
// Assinar é cálculo local: este cliente nunca abre conexão. Sem MINIO_PUBLIC_ENDPOINT (backend
// fora do compose, com o MinIO publicado em localhost), o endereço interno já é o alcançável.
const publicEndpoint = process.env.MINIO_PUBLIC_ENDPOINT || process.env.MINIO_ENDPOINT;
const { MINIO_PRESIGN_USER, MINIO_PRESIGN_PASSWORD } = process.env;

export const presignClient = MINIO_PRESIGN_USER && MINIO_PRESIGN_PASSWORD
    ? client(publicEndpoint, MINIO_PRESIGN_USER, MINIO_PRESIGN_PASSWORD)
    : null;

if (process.env.NODE_ENV === 'production') {
    if (!presignClient) {
        console.warn('⚠️  MINIO_PRESIGN_USER/MINIO_PRESIGN_PASSWORD ausentes — download de PDF persistido vai responder 500.');
    }
    if (!process.env.MINIO_PUBLIC_ENDPOINT) {
        console.warn('⚠️  MINIO_PUBLIC_ENDPOINT ausente — URLs de download serão assinadas com o endereço interno, que o navegador não alcança.');
    }
}
