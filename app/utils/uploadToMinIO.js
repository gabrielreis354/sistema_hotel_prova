import { PutObjectCommand, CreateBucketCommand, HeadBucketCommand } from '@aws-sdk/client-s3';
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
