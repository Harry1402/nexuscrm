import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { env } from './config/env';
import { healthRouter } from './health/routes';
import { whatsappRouter } from './whatsapp/routes';
import { twilioRouter } from './twilio/routes';
import { timelineRouter } from './timeline/routes';
import { dashboardRouter } from './dashboard/routes';
import { emailRouter } from './email/routes';
import { auditRouter } from './audit/routes';
import { AuditLogger } from './audit/logger';

const app = express();

// Global Middlewares
app.use(cors());
// Twilio sends application/x-www-form-urlencoded, while Meta sends application/json
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health Check Routes (Phase 21 Enterprise Multi-Service Probes)
app.use('/health', healthRouter);

// Omnichannel Webhook & API Routes
app.use('/api/v1/whatsapp', whatsappRouter);
app.use('/api/v1/twilio', twilioRouter);
app.use('/api/v1/timeline', timelineRouter);
app.use('/api/v1/email', emailRouter);
app.use('/api/v1/audit', auditRouter);
app.use('/dashboard', dashboardRouter);

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
    AuditLogger.info('SYSTEM', 'HTTP server started', { port: env.PORT, env: env.NODE_ENV });
  });
}

export default app;
