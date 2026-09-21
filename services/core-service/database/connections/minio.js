import { S3Client } from '@aws-sdk/client-s3';

export default new S3Client({
    endpoint: process.env.MINIO_ENDPOINT,
    region: 'us-east-1',
    credentials: {
        accessKeyId: process.env.MINIO_ROOT_USER,
        secretAccessKey: process.env.MINIO_ROOT_PASSWORD,
    },
    forcePathStyle: true,
});
