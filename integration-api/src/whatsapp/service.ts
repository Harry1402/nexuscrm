import axios from 'axios';
import { env } from '../config/env';

export interface WhatsAppInboundMessage {
  from: string;
  id: string;
  timestamp: string;
  text?: string;
  type: string;
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
   * Send a text message to a WhatsApp user
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
          messages.push({
            from: msg.from,
            id: msg.id,
            timestamp: msg.timestamp,
            text: msg.text?.body,
            type: msg.type,
          });
        }
      }
    } catch (err) {
      console.error('Failed to parse WhatsApp webhook payload:', err);
    }
    return messages;
  }
}
