import axios from 'axios';
import crypto from 'crypto';
import { env } from '../config/env';
import { uploadFile } from '../storage/minio';

export interface WhatsAppInboundMessage {
  from: string;
  id: string;
  timestamp: string;
  text?: string;
  type: string;
  mediaId?: string;
  mimeType?: string;
}

export interface WhatsAppStatusUpdate {
  id: string;
  status: string;
  timestamp: string;
  recipientId: string;
  errors?: any[];
}

export class WhatsAppService {
  /**
   * Verify challenge token sent by Meta Graph API during webhook configuration
   */
  static verifyWebhook(mode: string, token: string, challenge: string): string | null {
    if (mode === 'subscribe' && token === env.WHATSAPP_VERIFY_TOKEN) {
      return challenge;
    }
    return null;
  }

  /**
   * Validate incoming Meta Webhook HMAC-SHA256 signature
   */
  static verifySignature(rawBody: string | Buffer, signatureHeader?: string): boolean {
    if (!env.WHATSAPP_APP_SECRET) {
      // In development mode where APP_SECRET is not yet supplied, allow requests
      if (env.NODE_ENV !== 'production') {
        return true;
      }
      return false;
    }

    if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
      return false;
    }

    try {
      const hmac = crypto.createHmac('sha256', env.WHATSAPP_APP_SECRET);
      const expectedSignature =
        'sha256=' +
        hmac
          .update(typeof rawBody === 'string' ? Buffer.from(rawBody) : rawBody)
          .digest('hex');

      return crypto.timingSafeEqual(
        Buffer.from(signatureHeader),
        Buffer.from(expectedSignature)
      );
    } catch (err) {
      console.error('[WhatsAppService] Error validating signature:', err);
      return false;
    }
  }

  /**
   * Send a free-form text message to a WhatsApp user
   */
  static async sendTextMessage(to: string, message: string) {
    if (!env.WHATSAPP_ACCESS_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) {
      throw new Error('WhatsApp credentials not configured in environment');
    }

    const url = `https://graph.facebook.com/v18.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
    const response = await axios.post(
      url,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: to,
        type: 'text',
        text: { preview_url: false, body: message },
      },
      {
        headers: {
          Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return response.data;
  }

  /**
   * Send an approved WhatsApp Interactive / Template message
   */
  static async sendTemplateMessage(
    to: string,
    templateName: string,
    languageCode = 'en_US',
    components?: any[]
  ) {
    if (!env.WHATSAPP_ACCESS_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) {
      throw new Error('WhatsApp credentials not configured in environment');
    }

    const url = `https://graph.facebook.com/v18.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
    const response = await axios.post(
      url,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: to,
        type: 'template',
        template: {
          name: templateName,
          language: { code: languageCode },
          components: components || [],
        },
      },
      {
        headers: {
          Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return response.data;
  }

  /**
   * Download inbound WhatsApp media (image, audio, document, video) from Meta Graph API
   * and archive it into MinIO S3 storage
   */
  static async downloadAndArchiveMedia(
    mediaId: string
  ): Promise<{ s3Key: string; success: boolean }> {
    if (!env.WHATSAPP_ACCESS_TOKEN) {
      return { s3Key: '', success: false };
    }

    try {
      // Step 1: Query Meta to retrieve media CDN URL
      const mediaInfoUrl = `https://graph.facebook.com/v18.0/${mediaId}`;
      const infoRes = await axios.get(mediaInfoUrl, {
        headers: { Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}` },
        timeout: 10000,
      });

      const mediaUrl = infoRes.data?.url;
      const mimeType = String(infoRes.data?.mime_type || 'application/octet-stream');

      if (!mediaUrl) {
        throw new Error('Media URL missing from Meta response');
      }

      // Step 2: Download raw binary media
      const mediaRes = await axios.get(mediaUrl, {
        headers: { Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}` },
        responseType: 'arraybuffer',
        timeout: 20000,
      });

      // Step 3: Determine file extension
      const ext = mimeType.includes('jpeg') || mimeType.includes('jpg')
        ? 'jpg'
        : mimeType.includes('png')
        ? 'png'
        : mimeType.includes('ogg')
        ? 'ogg'
        : mimeType.includes('mp4')
        ? 'mp4'
        : mimeType.includes('pdf')
        ? 'pdf'
        : 'bin';

      const s3Key = `whatsapp/${mediaId}.${ext}`;
      await uploadFile(s3Key, Buffer.from(mediaRes.data), mimeType);
      console.log(`[WhatsAppService] Archived inbound media to MinIO: ${s3Key}`);

      return { s3Key, success: true };
    } catch (err: any) {
      console.error(
        `[WhatsAppService] Failed to archive media ${mediaId} to MinIO:`,
        err?.message || err
      );
      return { s3Key: '', success: false };
    }
  }

  /**
   * Extract messages from incoming Meta webhook payload
   */
  static extractMessages(payload: any): WhatsAppInboundMessage[] {
    const messages: WhatsAppInboundMessage[] = [];
    try {
      const entry = payload.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;
      const rawMessages = value?.messages;

      if (Array.isArray(rawMessages)) {
        for (const msg of rawMessages) {
          const type = msg.type;
          let bodyText: string | undefined = msg.text?.body;
          let mediaId: string | undefined;
          let mimeType: string | undefined;

          // Check if message is a media type
          if (['image', 'audio', 'document', 'video', 'voice', 'sticker'].includes(type)) {
            const mediaObj = msg[type];
            mediaId = mediaObj?.id;
            mimeType = mediaObj?.mime_type;
            bodyText = mediaObj?.caption || `[Media: ${type}]`;
          }

          messages.push({
            from: msg.from,
            id: msg.id,
            timestamp: msg.timestamp,
            text: bodyText,
            type: msg.type,
            mediaId,
            mimeType,
          });
        }
      }
    } catch (err) {
      console.error('Failed to parse WhatsApp webhook messages:', err);
    }
    return messages;
  }

  /**
   * Extract delivery status updates from incoming Meta webhook payload
   */
  static extractStatuses(payload: any): WhatsAppStatusUpdate[] {
    const statuses: WhatsAppStatusUpdate[] = [];
    try {
      const entry = payload.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;
      const rawStatuses = value?.statuses;

      if (Array.isArray(rawStatuses)) {
        for (const st of rawStatuses) {
          statuses.push({
            id: st.id,
            status: st.status, // sent, delivered, read, failed
            timestamp: st.timestamp,
            recipientId: st.recipient_id,
            errors: st.errors,
          });
        }
      }
    } catch (err) {
      console.error('Failed to parse WhatsApp webhook statuses:', err);
    }
    return statuses;
  }
}
