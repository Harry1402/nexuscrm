import twilio from 'twilio';
import { env } from '../config/env';

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
   * Send SMS via Twilio API
   */
  static async sendSms(to: string, body: string) {
    const client = this.getClient();
    if (!env.TWILIO_PHONE_NUMBER) {
      throw new Error('TWILIO_PHONE_NUMBER not configured');
    }

    const message = await client.messages.create({
      from: env.TWILIO_PHONE_NUMBER,
      to: to,
      body: body,
    });

    return message;
  }
}
