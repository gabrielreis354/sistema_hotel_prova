import { PutObjectCommand, GetObjectCommand, CreateBucketCommand, HeadBucketCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import s3Client from '../../database/connections/minio.js';

const BUCKET = process.env.MINIO_BUCKET || 'hotel-contracts';

async function ensureBucket() {
    try {
        await s3Client.send(new HeadBucketCommand({ Bucket: BUCKET }));
    } catch {
        await s3Client.send(new CreateBucketCommand({ Bucket: BUCKET }));
    }
}

export default async function uploadToMinIO(buffer, key) {
    await ensureBucket();
    await s3Client.send(new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: buffer,
        ContentType: 'application/pdf',
    }));
    return `${process.env.MINIO_ENDPOINT}/${BUCKET}/${key}`;
}

// Bucket é privado (padrão do MinIO — ensureBucket() não define policy pública), então
// o download precisa de uma URL assinada e temporária em vez de um link direto.
export async function getPresignedDownloadUrl(key, expiresInSeconds = 300) {
    const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
    return getSignedUrl(s3Client, command, { expiresIn: expiresInSeconds });
}
