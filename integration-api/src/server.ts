import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { env } from './config/env';
import { checkStorageHealth } from './storage/minio';
import { checkEspoHealth } from './espocrm/client';
import { whatsappRouter } from './whatsapp/routes';
import { twilioRouter } from './twilio/routes';
import { timelineRouter } from './timeline/routes';
import { emailRouter } from './email/routes';
import { EmailService } from './email/service';

const app = express();

// Global Middlewares
app.use(cors());
// Twilio sends application/x-www-form-urlencoded, while Meta sends application/json
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health Check Endpoint (Phase 21 preliminary support)
app.get('/health', async (_req: Request, res: Response) => {
  const minioHealthy = await checkStorageHealth();
  const espoHealthy = await checkEspoHealth();
  const smtpHealthy = env.SMTP_HOST ? await EmailService.checkSmtpHealth() : null;

  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      espocrm: espoHealthy ? 'up' : 'unreachable',
      minio: minioHealthy ? 'up' : 'down',
      smtp: env.SMTP_HOST ? (smtpHealthy ? 'up' : 'down') : 'unconfigured',
      twilio: env.TWILIO_ACCOUNT_SID ? 'configured' : 'unconfigured',
      whatsapp: env.WHATSAPP_ACCESS_TOKEN ? 'configured' : 'unconfigured',
    },
  });
});

// Omnichannel Webhook & API Routes
app.use('/api/v1/whatsapp', whatsappRouter);
app.use('/api/v1/twilio', twilioRouter);
app.use('/api/v1/timeline', timelineRouter);
app.use('/api/v1/email', emailRouter);

// Root route
app.get('/', (_req: Request, res: Response) => {
  res.json({
    service: 'nexus-crm-integration-api',
    version: '1.0.0',
    status: 'running',
  });
});

// Global Error Handler
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled Application Error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// Start HTTP Server
if (process.env.NODE_ENV !== 'test') {
  app.listen(env.PORT, () => {
    console.log(`🚀 NexusCRM Integration API running on http://localhost:${env.PORT}`);
    console.log(`📁 MinIO Target Bucket: ${env.MINIO_BUCKET}`);
  });
}

export default app;
