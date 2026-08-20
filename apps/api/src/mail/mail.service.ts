import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { EnvVariable } from '../config/env.validation';

/**
 * One transport for both environments (SRS section 3): Maildev catches mail in
 * development, a real SMTP relay sends it in production. Only MAIL_HOST and
 * MAIL_PORT change between them.
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
    this.transporter = nodemailer.createTransport({
      host: this.config.get('MAIL_HOST', { infer: true }),
      port: this.config.get('MAIL_PORT', { infer: true }),
      // Maildev speaks plain SMTP on 1025; a real relay upgrades via STARTTLS.
      secure: false,
      ignoreTLS: this.config.get('NODE_ENV', { infer: true }) !== 'production'
    });
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
