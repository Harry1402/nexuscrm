import nodemailer, { Transporter } from 'nodemailer';
import { env } from '../config/env';
import { TimelineService, RecordEventResult } from '../timeline/service';

export interface EmailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  from?: string;
  parentId?: string;
  parentType?: 'Contact' | 'Lead' | 'Account';
}

export interface InboundEmailPayload {
  from: string;
  to: string;
  subject: string;
  text?: string;
  html?: string;
  headers?: Record<string, any>;
  attachments?: Array<{
    filename: string;
    contentType: string;
    size?: number;
  }>;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  timelineResult?: RecordEventResult;
  error?: string;
}

export class EmailService {
  private static transporter: Transporter | null = null;

  /**
   * Lazily initialize and return the Nodemailer transporter.
   */
  static getTransporter(): Transporter {
    if (!this.transporter) {
      if (!env.SMTP_HOST) {
        throw new Error('SMTP_HOST is not configured in environment variables');
      }

      this.transporter = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE,
        auth: env.SMTP_USER
          ? {
              user: env.SMTP_USER,
              pass: env.SMTP_PASSWORD,
            }
          : undefined,
        tls: {
          rejectUnauthorized: env.NODE_ENV === 'production',
        },
      });
    }

    return this.transporter;
  }

  /**
   * Verify SMTP connection health.
   */
  static async checkSmtpHealth(): Promise<boolean> {
    if (!env.SMTP_HOST) {
      return false;
    }
    try {
      const transporter = this.getTransporter();
      await transporter.verify();
      return true;
    } catch (err: any) {
      console.warn('[EmailService] SMTP verification probe failed:', err?.message || err);
      return false;
    }
  }

  /**
   * Send transactional/outbound email via SMTP and synchronize to the EspoCRM timeline.
   */
  static async sendEmail(options: EmailOptions): Promise<SendEmailResult> {
    if (!env.SMTP_HOST) {
      console.warn('SMTP credentials not configured in environment. Skipping email dispatch.');
      return {
        success: false,
        error: 'SMTP host not configured',
      };
    }

    const sender = options.from || env.SMTP_FROM;
    const transporter = this.getTransporter();

    try {
      const info = await transporter.sendMail({
        from: sender,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
      });

      console.log(`[Email Outbound Sent] To: ${options.to}, MessageId: ${info.messageId}`);

      // Record in Unified Communication Timeline
      let timelineResult: RecordEventResult | undefined;
      try {
        timelineResult = await TimelineService.recordEvent({
          type: 'EMAIL',
          direction: 'OUTBOUND',
          sender: sender,
          recipient: options.to,
          subject: options.subject,
          body: options.text || options.html || '(No text content)',
          parentId: options.parentId,
          parentType: options.parentType,
          status: 'SENT',
        });
      } catch (timelineErr: any) {
        console.warn(
          '[EmailService] Email sent but failed to record to timeline:',
          timelineErr?.message
        );
      }

      return {
        success: true,
        messageId: info.messageId,
        timelineResult,
      };
    } catch (err: any) {
      console.error('[EmailService] Failed to send email via SMTP:', err);
      return {
        success: false,
        error: err?.message || 'SMTP dispatch failed',
      };
    }
  }

  /**
   * Process inbound email webhook (e.g. from SendGrid, Mailgun, AWS SES)
   * and synchronize to the EspoCRM timeline.
   */
  static async handleInboundEmail(payload: InboundEmailPayload): Promise<{
    success: boolean;
    timelineResult?: RecordEventResult;
    error?: string;
  }> {
    try {
      const body = payload.text || payload.html || '(No email body)';

      console.log(`[Email Inbound Received] From: ${payload.from}, Subject: ${payload.subject}`);

      const timelineResult = await TimelineService.recordEvent({
        type: 'EMAIL',
        direction: 'INBOUND',
        sender: payload.from,
        recipient: payload.to,
        subject: payload.subject,
        body: body,
        status: 'RECEIVED',
      });

      return {
        success: true,
        timelineResult,
      };
    } catch (err: any) {
      console.error('[EmailService] Failed to process inbound email:', err);
      return {
        success: false,
        error: err?.message || 'Failed to process inbound email',
      };
    }
  }
}
