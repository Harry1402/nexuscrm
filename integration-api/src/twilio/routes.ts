import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { TwilioService } from './service';
import { TimelineService } from '../timeline/service';
import { env } from '../config/env';

export const twilioRouter = Router();

// Zod Schema for Outbound Call Request
const OutboundCallSchema = z.object({
  to: z
    .string()
    .min(5)
    .max(20)
    .regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format (must follow E.164)'),
  from: z.string().optional(),
  parentId: z.string().min(1).max(64).optional(),
  parentType: z.enum(['Contact', 'Lead', 'Account']).optional(),
  twiml: z.string().max(2000).optional(),
  url: z.string().url().max(1000).optional(),
});

// Zod Schema for Outbound SMS Request
const OutboundSmsSchema = z.object({
  to: z
    .string()
    .min(5)
    .max(20)
    .regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format (must follow E.164)'),
  body: z.string().min(1, 'Message body is required').max(1600, 'SMS body exceeds 1600 characters'),
  from: z.string().optional(),
  parentId: z.string().min(1).max(64).optional(),
  parentType: z.enum(['Contact', 'Lead', 'Account']).optional(),
  mediaUrl: z.array(z.string().url()).optional(),
});

// ─── Voice Routes ─────────────────────────────────────────────────────────────

/**
 * POST /api/v1/twilio/voice
 * Inbound Voice Webhook returning dynamic TwiML response
 */
twilioRouter.post('/voice', (req: Request, res: Response): void => {
  if (!TwilioService.validateTwilioWebhook(req)) {
    res.status(403).send('Forbidden: Invalid Twilio Signature');
    return;
  }

  const from = req.body.From || 'Unknown';
  console.log(`[Twilio Voice Inbound] Incoming call from: ${from}`);

  const twiml = TwilioService.generateInboundTwiml({
    greeting: 'Welcome to NexusCRM. Please leave your message after the tone.',
    recordAction: '/api/v1/twilio/recording',
    maxLength: 120,
  });

  res.type('text/xml');
  res.send(twiml);
});

/**
 * POST /api/v1/twilio/voice/outbound
 * Initiate an outbound click-to-dial call
 */
twilioRouter.post('/voice/outbound', async (req: Request, res: Response): Promise<void> => {
  const parseResult = OutboundCallSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      error: 'Invalid outbound call payload',
      details: parseResult.error.flatten().fieldErrors,
    });
    return;
  }

  const { to, from, parentId, parentType, twiml, url } = parseResult.data;

  try {
    const callerId = from || env.TWILIO_PHONE_NUMBER;
    const call = await TwilioService.makeCall({ to, from: callerId, twiml, url });

    // Record outbound call initiation in timeline
    await TimelineService.recordEvent({
      type: 'CALL',
      direction: 'OUTBOUND',
      sender: callerId || 'system',
      recipient: to,
      parentId,
      parentType,
      status: 'SENT',
      body: `Initiated outbound call (SID: ${call.sid})`,
    });

    res.status(200).json({
      success: true,
      callSid: call.sid,
      status: call.status,
    });
  } catch (err: any) {
    console.error('[Twilio Outbound Call Error]', err);
    res.status(502).json({
      error: 'Failed to initiate outbound call',
      message: err?.message || 'Twilio Voice API error',
    });
  }
});

/**
 * POST /api/v1/twilio/voice/status
 * Call progress and lifecycle status callbacks
 */
twilioRouter.post('/voice/status', (req: Request, res: Response): void => {
  const callSid = req.body.CallSid;
  const callStatus = req.body.CallStatus;
  const duration = req.body.CallDuration;

  console.log(
    `[Twilio Voice Status] CallSid: ${callSid}, Status: ${callStatus}, Duration: ${duration || 0}s`
  );

  res.sendStatus(200);
});

/**
 * POST /api/v1/twilio/recording
 * Twilio Call recording callback: downloads audio, archives to MinIO, and records to timeline
 */
twilioRouter.post('/recording', async (req: Request, res: Response): Promise<void> => {
  const recordingUrl = req.body.RecordingUrl;
  const callSid = req.body.CallSid;
  const duration = parseInt(req.body.RecordingDuration || '0', 10);
  const from = req.body.From || 'Unknown';
  const to = req.body.To || env.TWILIO_PHONE_NUMBER || 'system';

  console.log(
    `[Twilio Recording Callback] CallSid: ${callSid}, Duration: ${duration}s, URL: ${recordingUrl}`
  );

  // Acknowledge webhook receipt to Twilio immediately
  res.sendStatus(200);

  if (recordingUrl) {
    try {
      // 1. Download and archive recording to MinIO
      const archiveResult = await TwilioService.downloadAndArchiveRecording(
        recordingUrl,
        callSid || `call-${Date.now()}`
      );

      const storedUrl = archiveResult.success ? archiveResult.s3Key : recordingUrl;

      // 2. Record to EspoCRM Activity Stream & Call entity
      await TimelineService.recordEvent({
        type: 'CALL',
        direction: 'INBOUND',
        sender: from,
        recipient: to,
        duration: duration,
        recordingUrl: storedUrl,
        status: 'COMPLETED',
        body: `Voicemail recording archived to storage (${duration}s)`,
      });
    } catch (err: any) {
      console.error('[Twilio Recording Pipeline Error]', err);
    }
  }
});

// ─── SMS Routes ───────────────────────────────────────────────────────────────

/**
 * POST /api/v1/twilio/sms/send
 * Dispatch an outbound SMS and synchronize with the CRM timeline
 */
twilioRouter.post('/sms/send', async (req: Request, res: Response): Promise<void> => {
  const parseResult = OutboundSmsSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      error: 'Invalid outbound SMS payload',
      details: parseResult.error.flatten().fieldErrors,
    });
    return;
  }

  const { to, body, from, parentId, parentType, mediaUrl } = parseResult.data;

  try {
    const callerId = from || env.TWILIO_PHONE_NUMBER;
    const message = await TwilioService.sendSms({
      to,
      body,
      from: callerId,
      mediaUrl,
      statusCallback: '/api/v1/twilio/sms/status',
    });

    // Record outbound SMS to CRM timeline
    await TimelineService.recordEvent({
      type: 'SMS',
      direction: 'OUTBOUND',
      sender: callerId || 'system',
      recipient: to,
      body: body,
      parentId,
      parentType,
      status: 'SENT',
    });

    res.status(200).json({
      success: true,
      messageSid: message.sid,
      status: message.status,
    });
  } catch (err: any) {
    console.error('[Twilio Outbound SMS Error]', err);
    res.status(502).json({
      error: 'Failed to dispatch SMS',
      message: err?.message || 'Twilio SMS API error',
    });
  }
});

/**
 * POST /api/v1/twilio/sms/status
 * Twilio SMS delivery receipt callback (sent, delivered, undelivered, failed)
 */
twilioRouter.post('/sms/status', (req: Request, res: Response): void => {
  const messageSid = req.body.MessageSid;
  const messageStatus = req.body.MessageStatus;
  const errorCode = req.body.ErrorCode;

  console.log(
    `[Twilio SMS Status Callback] SID: ${messageSid}, Status: ${messageStatus}${errorCode ? `, Error: ${errorCode}` : ''}`
  );

  res.sendStatus(200);
});

/**
 * POST /api/v1/twilio/sms
 * Inbound SMS & MMS Webhook with signature verification and MinIO media archiving
 */
twilioRouter.post('/sms', async (req: Request, res: Response): Promise<void> => {
  if (!TwilioService.validateTwilioWebhook(req)) {
    res.status(403).send('Forbidden: Invalid Twilio Signature');
    return;
  }

  const from = req.body.From;
  const to = req.body.To || env.TWILIO_PHONE_NUMBER || 'system';
  let body = req.body.Body || '';
  const messageSid = req.body.MessageSid || `msg-${Date.now()}`;
  const numMedia = parseInt(req.body.NumMedia || '0', 10);

  console.log(`[Twilio SMS Inbound] From: ${from}, Body: ${body}, Media count: ${numMedia}`);

  // Return standard empty TwiML response immediately to avoid Twilio timeout
  res.type('text/xml');
  res.send('<Response></Response>');

  // If inbound MMS media is attached, archive to MinIO S3
  const archivedMediaUrls: string[] = [];
  if (numMedia > 0) {
    for (let i = 0; i < numMedia; i++) {
      const mediaUrl = req.body[`MediaUrl${i}`];
      if (mediaUrl) {
        try {
          const archive = await TwilioService.downloadAndArchiveMms(
            mediaUrl,
            messageSid,
            i
          );
          if (archive.success) {
            archivedMediaUrls.push(archive.s3Key);
          }
        } catch (mmsErr) {
          console.warn(`[Twilio MMS Download Error for index ${i}]`, mmsErr);
        }
      }
    }
  }

  if (archivedMediaUrls.length > 0) {
    body += `\n[MMS Attachments: ${archivedMediaUrls.join(', ')}]`;
  }

  if (from && (body || archivedMediaUrls.length > 0)) {
    try {
      await TimelineService.recordEvent({
        type: 'SMS',
        direction: 'INBOUND',
        sender: from,
        recipient: to,
        body: body,
        status: 'RECEIVED',
      });
    } catch (err) {
      console.error('[Twilio SMS Timeline Error]', err);
    }
  }
});
