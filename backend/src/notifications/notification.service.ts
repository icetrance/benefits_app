import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private readonly transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: false,
    auth: process.env.SMTP_USER
      ? {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      : undefined
  });

  async send(to: string, subject: string, text: string) {
    if (!process.env.SMTP_HOST) {
      this.logger.log(`[MAIL FALLBACK] To: ${to} | ${subject} | ${text}`);
      return;
    }
    await this.transporter.sendMail({
      from: process.env.SMTP_FROM || 'expenseflow@example.com',
      to,
      subject,
      text
    });
  }
}
