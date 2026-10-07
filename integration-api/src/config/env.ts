import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

// Load .env from root project directory or local integration-api/.env
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3000').transform((val) => parseInt(val, 10)),

  // EspoCRM
  ESPOCRM_SITE_URL: z.string().url().default('http://localhost:8080'),
  ESPOCRM_API_KEY: z.string().optional().default(''),

  // MinIO / S3
  MINIO_ENDPOINT: z.string().default('http://localhost:9000'),
  MINIO_ROOT_USER: z.string().default('minioadmin'),
  MINIO_ROOT_PASSWORD: z.string().default('minio_secret'),
  MINIO_BUCKET: z.string().default('crm-files'),
  MINIO_USE_SSL: z
    .string()
    .default('false')
    .transform((val) => val === 'true'),

  // Twilio
  TWILIO_ACCOUNT_SID: z.string().optional().default(''),
  TWILIO_AUTH_TOKEN: z.string().optional().default(''),
  TWILIO_PHONE_NUMBER: z.string().optional().default(''),

  // WhatsApp
  WHATSAPP_ACCESS_TOKEN: z.string().optional().default(''),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional().default(''),
  WHATSAPP_VERIFY_TOKEN: z.string().optional().default(''),

  // SMTP
  SMTP_HOST: z.string().optional().default(''),
  SMTP_PORT: z.string().optional().default('587'),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASSWORD: z.string().optional().default(''),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('❌ Environment configuration error:', parsedEnv.error.format());
  throw new Error('Invalid environment variables');
}

export const env = parsedEnv.data;
