import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3';
import { env } from '../config/env';

export const s3Client = new S3Client({
  endpoint: env.MINIO_ENDPOINT,
  region: 'us-east-1',
  credentials: {
    accessKeyId: env.MINIO_ROOT_USER,
    secretAccessKey: env.MINIO_ROOT_PASSWORD,
  },
  forcePathStyle: true,
});

export const BUCKET_NAME = env.MINIO_BUCKET;

export async function checkStorageHealth(): Promise<boolean> {
  try {
    await s3Client.send(new HeadBucketCommand({ Bucket: BUCKET_NAME }));
    return true;
  } catch (error) {
    console.error('MinIO Health Check Error:', error);
    return false;
  }
}

export async function uploadFile(
  key: string,
  body: Buffer | Uint8Array | string,
  contentType = 'application/octet-stream'
) {
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: body,
    ContentType: contentType,
  });
  return await s3Client.send(command);
}

export async function getFile(key: string) {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });
  return await s3Client.send(command);
}
