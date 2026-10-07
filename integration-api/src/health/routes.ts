import { Router, Request, Response } from 'express';
import { env } from '../config/env';
import { checkStorageHealth } from '../storage/minio';
import { checkEspoHealth } from '../espocrm/client';
import { EmailService } from '../email/service';

export const healthRouter = Router();

/**
 * GET /health
 * Consolidated enterprise health check endpoint for all interconnected services.
 */
healthRouter.get('/', async (_req: Request, res: Response): Promise<void> => {
  const [espoHealthy, minioHealthy, smtpHealthy] = await Promise.all([
    checkEspoHealth(),
    checkStorageHealth(),
    env.SMTP_HOST ? EmailService.checkSmtpHealth() : Promise.resolve(null),
  ]);

  const twilioConfigured = !!(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN);
  const whatsappConfigured = !!(env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID);

  const isDegraded = !espoHealthy || !minioHealthy;
  const overallStatus = isDegraded ? 'degraded' : 'healthy';

  const statusCode = isDegraded ? 503 : 200;

  res.status(statusCode).json({
    status: overallStatus,
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    services: {
      espocrm: espoHealthy ? 'up' : 'unreachable',
      minio: minioHealthy ? 'up' : 'down',
      smtp: env.SMTP_HOST ? (smtpHealthy ? 'up' : 'down') : 'unconfigured',
      twilio: twilioConfigured ? 'configured' : 'unconfigured',
      whatsapp: whatsappConfigured ? 'configured' : 'unconfigured',
    },
  });
});

/**
 * GET /health/espocrm
 * Dedicated probe for EspoCRM core API readiness and response latency.
 */
healthRouter.get('/espocrm', async (_req: Request, res: Response): Promise<void> => {
  const start = Date.now();
  const healthy = await checkEspoHealth();
  const latencyMs = Date.now() - start;

  res.status(healthy ? 200 : 503).json({
    service: 'espocrm',
    status: healthy ? 'up' : 'unreachable',
    endpoint: `${env.ESPOCRM_SITE_URL}/api/v1/App/user`,
    latencyMs,
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /health/minio
 * Dedicated probe for MinIO S3 object storage bucket accessibility.
 */
healthRouter.get('/minio', async (_req: Request, res: Response): Promise<void> => {
  const healthy = await checkStorageHealth();

  res.status(healthy ? 200 : 503).json({
    service: 'minio',
    status: healthy ? 'up' : 'down',
    bucket: env.MINIO_BUCKET,
    endpoint: env.MINIO_ENDPOINT,
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /health/twilio
 * Configuration readiness probe for Twilio SMS and Voice telephony.
 */
healthRouter.get('/twilio', (_req: Request, res: Response): void => {
  const configured = !!(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN);

  res.status(200).json({
    service: 'twilio',
    status: configured ? 'configured' : 'unconfigured',
    phoneNumberConfigured: !!env.TWILIO_PHONE_NUMBER,
    voiceWebhook: '/api/v1/twilio/voice',
    smsWebhook: '/api/v1/twilio/sms',
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /health/whatsapp
 * Configuration readiness probe for Meta WhatsApp Cloud API webhooks.
 */
healthRouter.get('/whatsapp', (_req: Request, res: Response): void => {
  const configured = !!(env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID);

  res.status(200).json({
    service: 'whatsapp',
    status: configured ? 'configured' : 'unconfigured',
    phoneNumberIdConfigured: !!env.WHATSAPP_PHONE_NUMBER_ID,
    webhook: '/api/v1/whatsapp/webhook',
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /health/email
 * Dedicated probe for SMTP transactional mail server transport connectivity.
 */
healthRouter.get('/email', async (_req: Request, res: Response): Promise<void> => {
  if (!env.SMTP_HOST) {
    res.status(200).json({
      service: 'smtp',
      status: 'unconfigured',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  const healthy = await EmailService.checkSmtpHealth();

  res.status(healthy ? 200 : 503).json({
    service: 'smtp',
    status: healthy ? 'up' : 'down',
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    timestamp: new Date().toISOString(),
  });
});
