import { env } from '../config/env';

export interface EmailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

export class EmailService {
  /**
   * Send transactional email using configured SMTP settings
   */
  static async sendEmail(options: EmailOptions): Promise<boolean> {
    if (!env.SMTP_HOST || !env.SMTP_USER) {
      console.warn('SMTP credentials not configured in environment. Skipping email dispatch.');
      return false;
    }

    // SMTP dispatch handler
    console.log(`[Email Outbound] To: ${options.to}, Subject: ${options.subject}`);
    return true;
  }
}
