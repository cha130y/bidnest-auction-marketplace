import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import * as nodemailer from 'nodemailer';
import { MailService } from './mail.service';

jest.mock('nodemailer');

const createTransport = nodemailer.createTransport as jest.MockedFunction<
  typeof nodemailer.createTransport
>;

/** The transport options the service builds, which is what these tests are about. */
type TransportOptions = {
  host: string;
  port: number;
  secure: boolean;
  requireTLS: boolean;
  ignoreTLS: boolean;
  tls: { rejectUnauthorized: boolean };
  auth?: { user: string; pass: string };
};

const maildev: Record<string, unknown> = {
  NODE_ENV: 'development',
  MAIL_HOST: 'localhost',
  MAIL_PORT: 1025,
  MAIL_FROM: 'BidNest <no-reply@bidnest.local>'
};

describe('MailService', () => {
  let sendMail: jest.Mock;

  /** Builds the service against one environment and hands back what it configured. */
  async function transportFor(env: Record<string, unknown>) {
    const moduleRef = await Test.createTestingModule({
      providers: [
        MailService,
        { provide: ConfigService, useValue: { get: (k: string) => env[k] } }
      ]
    }).compile();

    const service = moduleRef.get(MailService);
    const options = createTransport.mock.calls[0][0] as TransportOptions;
    return { service, options };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    sendMail = jest.fn().mockResolvedValue(undefined);
    createTransport.mockReturnValue({
      sendMail,
      close: jest.fn()
    } as unknown as ReturnType<typeof nodemailer.createTransport>);
  });

  describe('transport', () => {
    it('talks plain SMTP to Maildev in development', async () => {
      const { options } = await transportFor(maildev);

      expect(options.port).toBe(1025);
      expect(options.secure).toBe(false);
      // Maildev offers no TLS at all, so insisting on it would send nothing.
      expect(options.ignoreTLS).toBe(true);
      expect(options.requireTLS).toBe(false);
      expect(options.auth).toBeUndefined();
      // Maildev's certificate is self-signed by construction, so verifying it
      // can only invent failures — an expired one broke the suite once.
      expect(options.tls.rejectUnauthorized).toBe(false);
    });

    it('logs in when a relay asks for credentials', async () => {
      const { options } = await transportFor({
        ...maildev,
        MAIL_HOST: 'smtp.resend.com',
        MAIL_PORT: 587,
        MAIL_USER: 'resend',
        MAIL_PASSWORD: 're_secret'
      });

      expect(options.auth).toEqual({ user: 'resend', pass: 're_secret' });
      // A password over an unencrypted hop is worse than no password.
      expect(options.requireTLS).toBe(true);
      expect(options.ignoreTLS).toBe(false);
      // And an unverified certificate is a hop that may not be the relay.
      expect(options.tls.rejectUnauthorized).toBe(true);
      // 587 upgrades through STARTTLS rather than starting encrypted.
      expect(options.secure).toBe(false);
    });

    it('starts encrypted on 465, where that is what the port means', async () => {
      const { options } = await transportFor({
        ...maildev,
        MAIL_PORT: 465,
        MAIL_USER: 'apikey',
        MAIL_PASSWORD: 'secret'
      });

      expect(options.secure).toBe(true);
    });

    it('lets MAIL_SECURE overrule the port', async () => {
      const { options } = await transportFor({
        ...maildev,
        MAIL_PORT: 2525,
        MAIL_SECURE: true,
        MAIL_USER: 'apikey',
        MAIL_PASSWORD: 'secret'
      });

      expect(options.secure).toBe(true);
    });

    it('never sends half a credential', async () => {
      const { options } = await transportFor({
        ...maildev,
        MAIL_USER: 'apikey'
      });

      // A user with no password would make nodemailer offer an AUTH command
      // the relay is bound to reject.
      expect(options.auth).toBeUndefined();
    });

    it('requires TLS in production even with no credentials', async () => {
      const { options } = await transportFor({
        ...maildev,
        NODE_ENV: 'production',
        MAIL_HOST: 'smtp.internal',
        MAIL_PORT: 25
      });

      expect(options.requireTLS).toBe(true);
      expect(options.ignoreTLS).toBe(false);
      expect(options.tls.rejectUnauthorized).toBe(true);
    });

    it('does not silently drop TLS when only the user is filled in', async () => {
      // Half a credential means no login, and no login means nothing to
      // protect — but this must never be read as licence to skip TLS where it
      // was actually wanted, so production stays strict regardless.
      const { options } = await transportFor({
        ...maildev,
        NODE_ENV: 'production',
        MAIL_USER: 'apikey'
      });

      expect(options.auth).toBeUndefined();
      expect(options.requireTLS).toBe(true);
      expect(options.tls.rejectUnauthorized).toBe(true);
    });
  });

  describe('sending', () => {
    it('mails the code without ever logging it', async () => {
      const { service } = await transportFor(maildev);
      const error = jest.spyOn(service['logger'], 'error');

      await service.sendTwoFactorCode('somchai@example.com', '043915', 10);

      const [message] = sendMail.mock.calls[0] as [
        { to: string; subject: string; text: string }
      ];
      expect(message.to).toBe('somchai@example.com');
      expect(message.text).toContain('043915');
      expect(error).not.toHaveBeenCalled();
    });

    it('reports a failed delivery without quoting the body', async () => {
      const { service } = await transportFor(maildev);
      const error = jest
        .spyOn(service['logger'], 'error')
        .mockImplementation(() => undefined);
      sendMail.mockRejectedValueOnce(new Error('connection refused'));

      await expect(
        service.sendTwoFactorCode('somchai@example.com', '043915', 10)
      ).rejects.toThrow('connection refused');

      // Section 6: the code must not reach the logs, and the body is where it
      // lives — so only the subject may be named.
      const logged = JSON.stringify(error.mock.calls);
      expect(logged).not.toContain('043915');
    });
  });
});
