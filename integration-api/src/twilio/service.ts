import twilio from 'twilio';
import axios from 'axios';
import { Request } from 'express';
import { env } from '../config/env';
import { uploadFile } from '../storage/minio';

export interface SendSmsOptions {
  to: string;
  body: string;
  from?: string;
  mediaUrl?: string[];
  statusCallback?: string;
}

export interface MakeCallOptions {
  to: string;
  from?: string;
  url?: string;
  twiml?: string;
}

export interface InboundTwimlOptions {
  greeting?: string;
  recordAction?: string;
  maxLength?: number;
}

export class TwilioService {
  private static client: twilio.Twilio | null = null;

  static getClient(): twilio.Twilio {
    if (!this.client) {
      if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) {
        throw new Error('Twilio credentials not configured in environment');
      }
      this.client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
    }
    return this.client;
  }

  /**
   * Send SMS via Twilio API with support for options, status callbacks, and MMS media
   */
  static async sendSms(optionsOrTo: SendSmsOptions | string, legacyBody?: string) {
    const client = this.getClient();
    let to: string;
    let body: string;
    let from: string | undefined;
    let mediaUrl: string[] | undefined;
    let statusCallback: string | undefined;

    if (typeof optionsOrTo === 'string') {
      to = optionsOrTo;
      body = legacyBody || '';
    } else {
      to = optionsOrTo.to;
      body = optionsOrTo.body;
      from = optionsOrTo.from;
      mediaUrl = optionsOrTo.mediaUrl;
      statusCallback = optionsOrTo.statusCallback;
    }

    const sender = from || env.TWILIO_PHONE_NUMBER;
    if (!sender) {
      throw new Error('TWILIO_PHONE_NUMBER not configured');
    }

    const payload: any = {
      from: sender,
      to,
      body,
    };

    if (mediaUrl && mediaUrl.length > 0) {
      payload.mediaUrl = mediaUrl;
    }
    if (statusCallback) {
      payload.statusCallback = statusCallback;
    }

    const message = await client.messages.create(payload);
    return message;
  }

  /**
   * Download inbound MMS media from Twilio and archive it to MinIO S3 storage
   */
  static async downloadAndArchiveMms(
    mediaUrl: string,
    messageSid: string,
    mediaIndex = 0
  ): Promise<{ s3Key: string; success: boolean }> {
    try {
      const response = await axios.get(mediaUrl, {
        responseType: 'arraybuffer',
        auth:
          env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN
            ? {
                username: env.TWILIO_ACCOUNT_SID,
                password: env.TWILIO_AUTH_TOKEN,
              }
            : undefined,
        timeout: 15000,
      });

      const contentType = String(response.headers['content-type'] || 'application/octet-stream');
      const ext =
        contentType.includes('jpeg') || contentType.includes('jpg')
          ? 'jpg'
          : contentType.includes('png')
          ? 'png'
          : contentType.includes('pdf')
          ? 'pdf'
          : 'bin';

      const s3Key = `mms/${messageSid}_${mediaIndex}.${ext}`;
      await uploadFile(s3Key, Buffer.from(response.data), contentType);
      console.log(`[TwilioService] Archived MMS media to MinIO: ${s3Key}`);

      return { s3Key, success: true };
    } catch (err: any) {
      console.error(
        `[TwilioService] Failed to archive MMS media from ${mediaUrl}:`,
        err?.message || err
      );
      return { s3Key: '', success: false };
    }
  }

  /**
   * Initiate an outbound call (click-to-dial)
   */
  static async makeCall(options: MakeCallOptions) {
    const client = this.getClient();
    const callerId = options.from || env.TWILIO_PHONE_NUMBER;

    if (!callerId) {
      throw new Error('TWILIO_PHONE_NUMBER not configured');
    }

    const callPayload: any = {
      to: options.to,
      from: callerId,
    };

    if (options.twiml) {
      callPayload.twiml = options.twiml;
    } else if (options.url) {
      callPayload.url = options.url;
    } else {
      // Default outbound TwiML message
      callPayload.twiml = `
        <Response>
          <Say>Connecting your call from NexusCRM. Please hold.</Say>
        </Response>
      `.trim();
    }

    const call = await client.calls.create(callPayload);
    return call;
  }

  /**
   * Generate programmable TwiML XML for incoming voice calls
   */
  static generateInboundTwiml(options?: InboundTwimlOptions): string {
    const response = new twilio.twiml.VoiceResponse();
    const greeting =
      options?.greeting ||
      'Thank you for calling NexusCRM. Please leave a message after the beep.';
    const recordAction = options?.recordAction || '/api/v1/twilio/recording';
    const maxLength = options?.maxLength || 120;

    response.say(greeting);
    response.record({
      action: recordAction,
      maxLength: maxLength,
      playBeep: true,
      recordingStatusCallback: recordAction,
    });
    response.say('Goodbye.');
    response.hangup();

    return response.toString();
  }

  /**
   * Download audio recording from Twilio and archive it to MinIO S3 storage
   */
  static async downloadAndArchiveRecording(
    recordingUrl: string,
    callSid: string
  ): Promise<{ s3Key: string; success: boolean }> {
    try {
      // Twilio recordings can be fetched directly as MP3 by appending .mp3
      const mediaUrl = recordingUrl.endsWith('.mp3')
        ? recordingUrl
        : `${recordingUrl}.mp3`;

      const response = await axios.get(mediaUrl, {
        responseType: 'arraybuffer',
        auth:
          env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN
            ? {
                username: env.TWILIO_ACCOUNT_SID,
                password: env.TWILIO_AUTH_TOKEN,
              }
            : undefined,
        timeout: 15000,
      });

      const audioBuffer = Buffer.from(response.data);
      const s3Key = `recordings/${callSid || Date.now()}.mp3`;

      await uploadFile(s3Key, audioBuffer, 'audio/mpeg');
      console.log(`[TwilioService] Archived call recording to MinIO: ${s3Key}`);

      return { s3Key, success: true };
    } catch (err: any) {
      console.error(
        `[TwilioService] Failed to archive recording ${recordingUrl} to MinIO:`,
        err?.message || err
      );
      return { s3Key: '', success: false };
    }
  }

  /**
   * Validate incoming Twilio webhook signature
   */
  static validateTwilioWebhook(req: Request): boolean {
    if (env.NODE_ENV !== 'production' && !env.TWILIO_AUTH_TOKEN) {
      return true; // Pass in non-configured dev/test mode
    }

    const signature = req.headers['x-twilio-signature'] as string;
    if (!signature || !env.TWILIO_AUTH_TOKEN) {
      return false;
    }

    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.get('host');
    const fullUrl = `${protocol}://${host}${req.originalUrl}`;

    return twilio.validateRequest(
      env.TWILIO_AUTH_TOKEN,
      signature,
      fullUrl,
      req.body || {}
    );
  }
}
