import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { EnvVariable } from '../config/env.validation';

/**
 * One transport for both environments (SRS section 3): Maildev catches mail in
 * development, a real SMTP relay sends it in production. Only the MAIL_*
 * settings change between them — no code does.
 *
 * A relay differs from Maildev in two ways, and both are read from env rather
 * than branched on NODE_ENV, so a staging box can point at a real provider
 * without pretending to be production:
 *
 *   MAIL_USER + MAIL_PASSWORD   a login, which Maildev neither wants nor
 *                               offers. Sent only when both are present.
 *   MAIL_SECURE                 implicit TLS. Port 465 means it; 587 upgrades
 *                               through STARTTLS instead, so the default
 *                               follows the port.
 *
 * Nothing here may log an OTP code or a reset link — section 6 forbids it, and
 * the Maildev dashboard already exposes every code without authentication,
 * which is exactly why it must never be reachable from production.
 */
@Injectable()
export class MailService implements OnModuleDestroy {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(private readonly config: ConfigService<EnvVariable, true>) {
    this.from = this.config.get('MAIL_FROM', { infer: true });

    const port = this.config.get('MAIL_PORT', { infer: true });
    const configuredSecure = this.config.get('MAIL_SECURE', { infer: true });
    const user = this.config.get('MAIL_USER', { infer: true });
    const password = this.config.get('MAIL_PASSWORD', { infer: true });
    const isProduction =
      this.config.get('NODE_ENV', { infer: true }) === 'production';

    // Is there anything on this connection worth protecting? A password, or
    // production traffic. If not, it is Maildev on loopback, and the whole
    // apparatus of certificates has nothing to say about it: the cert is
    // self-signed by construction, so checking it only invents failures —
    // an expired one took the whole test suite down once.
    const trusted = isProduction || Boolean(user && password);

    this.transporter = nodemailer.createTransport({
      host: this.config.get('MAIL_HOST', { infer: true }),
      port,
      secure: configuredSecure ?? port === 465,
      // A password over an unencrypted hop is worse than no password, so
      // STARTTLS stops being optional the moment there is one to protect.
      requireTLS: trusted,
      ignoreTLS: !trusted,
      tls: { rejectUnauthorized: trusted },
      // Both or neither: a half-filled credential would make nodemailer send
      // an AUTH command the relay is bound to reject.
      auth: user && password ? { user, pass: password } : undefined
    });

    if (isProduction && !user) {
      // Not fatal — an internal relay may authenticate by IP — but an open
      // relay is the far likelier reading, and it is worth saying out loud.
      this.logger.warn(
        'MAIL_USER is not set: sending unauthenticated in production'
      );
    }
  }

  onModuleDestroy() {
    this.transporter.close();
  }

  /** AUTH-007 — the one-time login code. */
  async sendTwoFactorCode(to: string, code: string, ttlMinutes: number) {
    await this.send({
      to,
      subject: 'รหัสยืนยันการเข้าสู่ระบบ BidNest',
      text:
        `รหัสยืนยันของคุณคือ ${code}\n\n` +
        `รหัสนี้ใช้ได้ครั้งเดียวและหมดอายุใน ${ttlMinutes} นาที\n` +
        'หากคุณไม่ได้เป็นผู้ขอเข้าสู่ระบบ กรุณาเปลี่ยนรหัสผ่านทันที'
    });
  }

  /** AUTH-005 — single-use password reset link. */
  async sendPasswordResetLink(to: string, link: string, ttlMinutes: number) {
    await this.send({
      to,
      subject: 'ตั้งรหัสผ่านใหม่สำหรับบัญชี BidNest',
      text:
        `เปิดลิงก์นี้เพื่อตั้งรหัสผ่านใหม่:\n${link}\n\n` +
        `ลิงก์ใช้ได้ครั้งเดียวและหมดอายุใน ${ttlMinutes} นาที\n` +
        'หากคุณไม่ได้เป็นผู้ขอ ไม่ต้องดำเนินการใดๆ'
    });
  }

  private async send(message: { to: string; subject: string; text: string }) {
    try {
      await this.transporter.sendMail({ from: this.from, ...message });
    } catch (error) {
      // Log that delivery failed, never the body — it carries the secret.
      this.logger.error(
        `Failed to deliver "${message.subject}"`,
        error instanceof Error ? error.stack : String(error)
      );
      throw error;
    }
  }
}
