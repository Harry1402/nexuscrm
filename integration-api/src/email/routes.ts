import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { EmailService } from './service';

export const emailRouter = Router();

// Zod Schema for Outbound Email Request
const SendEmailSchema = z.object({
  to: z.string().email('Invalid recipient email address'),
  subject: z.string().min(1, 'Subject is required').max(500),
  text: z.string().max(50000).optional(),
  html: z.string().max(100000).optional(),
  parentId: z.string().min(1).max(64).optional(),
  parentType: z.enum(['Contact', 'Lead', 'Account']).optional(),
});

// Zod Schema for Inbound Email Webhook
const InboundEmailSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  subject: z.string().default('(No Subject)'),
  text: z.string().optional(),
  html: z.string().optional(),
  headers: z.record(z.string(), z.any()).optional(),
  attachments: z
    .array(
      z.object({
        filename: z.string(),
        contentType: z.string(),
        size: z.number().optional(),
      })
    )
    .optional(),
});

/**
 * POST /api/v1/email/send
 * Dispatches an outbound email via SMTP and records it to the CRM timeline.
 */
emailRouter.post('/send', async (req: Request, res: Response): Promise<void> => {
  const parseResult = SendEmailSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      error: 'Invalid email payload',
      details: parseResult.error.flatten().fieldErrors,
    });
    return;
  }

  try {
    const result = await EmailService.sendEmail(parseResult.data);
    if (!result.success) {
      res.status(502).json({
        error: 'Failed to dispatch email',
        message: result.error,
      });
      return;
    }

    res.status(200).json(result);
  } catch (err: any) {
    console.error('[Email Route /send Error]', err);
    res.status(500).json({ error: 'Internal email service error' });
  }
});

/**
 * POST /api/v1/email/inbound
 * Ingests inbound emails from mail provider webhooks into the CRM timeline.
 */
emailRouter.post('/inbound', async (req: Request, res: Response): Promise<void> => {
  const parseResult = InboundEmailSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      error: 'Invalid inbound email payload',
      details: parseResult.error.flatten().fieldErrors,
    });
    return;
  }

  try {
    const result = await EmailService.handleInboundEmail(parseResult.data);
    res.status(result.success ? 200 : 500).json(result);
  } catch (err: any) {
    console.error('[Email Route /inbound Error]', err);
    res.status(500).json({ error: 'Failed to process inbound email' });
  }
});

/**
 * GET /api/v1/email/health
 * Probes SMTP connection health.
 */
emailRouter.get('/health', async (_req: Request, res: Response): Promise<void> => {
  const isHealthy = await EmailService.checkSmtpHealth();
  res.status(200).json({
    service: 'smtp',
    healthy: isHealthy,
  });
});
