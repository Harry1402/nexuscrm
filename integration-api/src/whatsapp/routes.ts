import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { WhatsAppService } from './service';
import { TimelineService } from '../timeline/service';
import { env } from '../config/env';
import { AuditLogger } from '../audit/logger';

export const whatsappRouter = Router();

// Zod Schema for Outbound WhatsApp Message
const OutboundWhatsAppSchema = z
  .object({
    to: z
      .string()
      .min(5)
      .max(20)
      .regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format (must follow E.164)'),
    message: z.string().max(4096).optional(),
    templateName: z.string().max(128).optional(),
    templateLanguage: z.string().max(16).default('en_US'),
    templateComponents: z.array(z.record(z.string(), z.any())).optional(),
    parentId: z.string().min(1).max(64).optional(),
    parentType: z.enum(['Contact', 'Lead', 'Account']).optional(),
  })
  .refine((data) => data.message || data.templateName, {
    message: 'Either message text or templateName must be provided',
  });

/**
 * GET /api/v1/whatsapp - Meta webhook verification handshake
 */
whatsappRouter.get('/', (req: Request, res: Response): void => {
  const mode = req.query['hub.mode'] as string;
  const token = req.query['hub.verify_token'] as string;
  const challenge = req.query['hub.challenge'] as string;

  const verifiedChallenge = WhatsAppService.verifyWebhook(mode, token, challenge);
  if (verifiedChallenge) {
    res.status(200).send(verifiedChallenge);
    return;
  }
  res.status(403).json({ error: 'Verification failed' });
});

/**
 * POST /api/v1/whatsapp - Inbound message & status webhook
 */
whatsappRouter.post('/', async (req: Request, res: Response): Promise<void> => {
  // 1. HMAC Signature verification in production
  const signature = req.headers['x-hub-signature-256'] as string | undefined;
  const rawBody = JSON.stringify(req.body);

  if (!WhatsAppService.verifySignature(rawBody, signature)) {
    console.warn('[WhatsApp Webhook] Invalid HMAC-SHA256 signature rejected');
    AuditLogger.warn('WEBHOOK', 'WhatsApp webhook rejected — invalid HMAC-SHA256 signature');
    res.status(403).send('Forbidden: Invalid Signature');
    return;
  }

  // Acknowledge receipt to Meta immediately (200 OK)
  res.status(200).send('EVENT_RECEIVED');

  try {
    // 2. Process Delivery Status Updates
    const statuses = WhatsAppService.extractStatuses(req.body);
    for (const status of statuses) {
      console.log(
        `[WhatsApp Delivery Status] Msg ID: ${status.id}, Status: ${status.status}, Recipient: ${status.recipientId}`
      );
    }

    // 3. Process Inbound Messages
    const messages = WhatsAppService.extractMessages(req.body);
    for (const msg of messages) {
      let bodyText = msg.text || '';

      // If media is present, archive to MinIO S3
      if (msg.mediaId) {
        try {
          const archive = await WhatsAppService.downloadAndArchiveMedia(msg.mediaId);
          if (archive.success) {
            bodyText += `\n[Media Attachment: ${archive.s3Key}]`;
          }
        } catch (mediaErr) {
          console.warn(`[WhatsApp Media Archive Error for ${msg.mediaId}]`, mediaErr);
        }
      }

      console.log(`[WhatsApp Inbound] From: ${msg.from}, Body: ${bodyText}`);

      // Synchronize to EspoCRM Activity Stream & auto-resolve Lead/Contact
      await TimelineService.recordEvent({
        type: 'WHATSAPP',
        direction: 'INBOUND',
        sender: msg.from,
        recipient: env.WHATSAPP_PHONE_NUMBER_ID || 'system',
        body: bodyText,
        status: 'RECEIVED',
      });

      AuditLogger.info('WEBHOOK', 'WhatsApp inbound message processed', {
        from: msg.from,
        hasMedia: !!msg.mediaId,
      });
    }
  } catch (err) {
    console.error('Error handling WhatsApp webhook payload:', err);
  }
});


/**
 * POST /api/v1/whatsapp/send
 * Dispatch outbound text or template message via WhatsApp Cloud API
 */
whatsappRouter.post('/send', async (req: Request, res: Response): Promise<void> => {
  const parseResult = OutboundWhatsAppSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      error: 'Invalid outbound WhatsApp payload',
      details: parseResult.error.flatten().fieldErrors,
    });
    return;
  }

  const {
    to,
    message,
    templateName,
    templateLanguage,
    templateComponents,
    parentId,
    parentType,
  } = parseResult.data;

  try {
    let result: any;
    let recordedBody: string;

    if (templateName) {
      result = await WhatsAppService.sendTemplateMessage(
        to,
        templateName,
        templateLanguage,
        templateComponents
      );
      recordedBody = `[Template: ${templateName} (${templateLanguage})]`;
    } else {
      result = await WhatsAppService.sendTextMessage(to, message!);
      recordedBody = message!;
    }

    // Record outbound WhatsApp dispatch into CRM timeline
    await TimelineService.recordEvent({
      type: 'WHATSAPP',
      direction: 'OUTBOUND',
      sender: env.WHATSAPP_PHONE_NUMBER_ID || 'system',
      recipient: to,
      body: recordedBody,
      parentId,
      parentType,
      status: 'SENT',
    });

    res.status(200).json({
      success: true,
      metaResponse: result,
    });
  } catch (err: any) {
    console.error('[WhatsApp Outbound Dispatch Error]', err);
    res.status(502).json({
      error: 'Failed to dispatch WhatsApp message',
      message: err?.response?.data || err?.message || 'Meta Graph API error',
    });
  }
});
