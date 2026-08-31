import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { EnvVariable } from '../config/env.validation';

/** How long to wait for SendGrid's API before giving up on a message. */
const HTTP_TIMEOUT_MS = 15_000;

/**
 * `BidNest <no-reply@bidnest.local>` split into the parts an API wants.
 *
 * SMTP takes the whole string as written; a JSON API takes a name and an
 * address as separate fields. A bare address with no display name is valid
 * either way and comes back with `name` unset.
 */
export function parseAddress(value: string): { email: string; name?: string } {
  const match = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(value);
  if (!match) return { email: value.trim() };

  const [, name, email] = match;
  return name ? { email: email.trim(), name } : { email: email.trim() };
}

/**
 * One interface, two ways out (SRS section 3): Maildev catches mail in
 * development, SendGrid sends it in production. Callers see neither — they ask
 * for a code or a reset link and this decides how it leaves.
 *
 * **Which one runs depends on SENDGRID_API_KEY alone.** Set, everything goes
 * over HTTPS to api.sendgrid.com and the MAIL_* connection settings are
 * ignored; absent, it is SMTP with those settings, which is what Maildev
 * needs and what every developer runs.
 *
 * The HTTPS path is not a preference. Every SendGrid SMTP port — 587, 465 and
 * 2525 — times out from the Railway container, while smtp.gmail.com:587
 * connects from that same container and api.sendgrid.com:443 answers normally.
 * That is a sending network refusing a hosting provider's address range, not
 * anything we can configure our way out of, and it fails by silence rather
 * than by refusal: the connection simply hangs, which is why a login could sit
 * on "กำลังตรวจสอบ..." with nothing in the logs to say why.
 *
 * MAIL_FROM still means the same thing on both paths, and still has to be an
 * address the provider has verified as yours.
 *
 * Nothing here may log an OTP code or a reset link — section 6 forbids it, and
 * the Maildev dashboard already exposes every code without authentication,
 * which is exactly why it must never be reachable from production.
 */
@Injectable()
export class MailService implements OnModuleDestroy {
  private readonly logger = new Logger(MailService.name);
  /** Null when sending over the API — there is no connection to hold open. */
  private readonly transporter: Transporter | null;
  private readonly apiKey: string | undefined;
  private readonly from: string;

  constructor(private readonly config: ConfigService<EnvVariable, true>) {
    this.from = this.config.get('MAIL_FROM', { infer: true });
    this.apiKey = this.config.get('SENDGRID_API_KEY', { infer: true });

    if (this.apiKey) {
      this.transporter = null;
      this.logger.log('Sending mail over the SendGrid API');
      return;
    }

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
      auth: user && password ? { user, pass: password } : undefined,
      /**
       * Keep the connection instead of building a new one per message.
       *
       * Every send otherwise pays for a TCP connection, a TLS handshake and an
       * SMTP login before any of the message moves. Pooled, only the first
       * message of a quiet period pays it.
       */
      pool: true,
      maxConnections: 3,
      /**
       * Fail rather than hang. A relay that accepts a connection and then goes
       * quiet would hold the socket open indefinitely, and a pooled connection
       * in that state blocks the messages behind it.
       */
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000
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
    this.transporter?.close();
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
      if (this.apiKey) {
        await this.sendOverApi(message);
        return;
      }

      await this.transporter!.sendMail({ from: this.from, ...message });
    } catch (error) {
      // Log that delivery failed, never the body — it carries the secret.
      this.logger.error(
        `Failed to deliver "${message.subject}"`,
        error instanceof Error ? error.stack : String(error)
      );
      throw error;
    }
  }

  /**
   * https://docs.sendgrid.com/api-reference/mail-send/mail-send
   *
   * A plain `fetch`, not the `@sendgrid/mail` package: this is one POST with a
   * bearer token, and a dependency to build it would be more code to audit and
   * update than the request it replaces.
   *
   * SendGrid answers 202 with an empty body when it accepts the message —
   * accepted for delivery, not delivered. What happens after that shows up in
   * the Activity feed, never here.
   *
   * The error message carries SendGrid's own response text, which names the
   * problem exactly ("The from address does not match a verified Sender
   * Identity", and so on). It is worth every byte at three in the morning.
   */
  private async sendOverApi(message: {
    to: string;
    subject: string;
    text: string;
  }) {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: message.to }] }],
        from: parseAddress(this.from),
        subject: message.subject,
        content: [{ type: 'text/plain', value: message.text }]
      }),
      // Bounded, for the same reason the SMTP transport has timeouts: a
      // request that never settles is a message that never fails, and a
      // failure nobody is told about is the one that costs a day.
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS)
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(
        `SendGrid answered ${response.status}${detail ? `: ${detail}` : ''}`
      );
    }
  }
}
