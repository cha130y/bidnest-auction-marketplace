import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import * as nodemailer from 'nodemailer';
import { MailService, parseAddress } from './mail.service';

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
  pool: boolean;
  maxConnections: number;
  connectionTimeout: number;
  greetingTimeout: number;
  socketTimeout: number;
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
    // Optional: the SendGrid API path opens no connection, so there is no
    // transport for it to have configured.
    const options = createTransport.mock.calls[0]?.[0] as TransportOptions;
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
    /**
     * Connection reuse is the difference between a login code going out in
     * milliseconds and waiting on a fresh TCP connection, a TLS handshake and
     * an SMTP login first. It is not environment-specific — Maildev benefits
     * the same way a hosted relay does — so it is asserted once, here.
     */
    it('reuses one pooled connection rather than dialling per message', async () => {
      const { options } = await transportFor(maildev);

      expect(options.pool).toBe(true);
      expect(options.maxConnections).toBe(3);
    });

    // A relay that accepts a connection and then goes quiet must not hold a
    // pooled slot for ever — the messages queued behind it would never move.
    it('gives up on a relay that stops answering', async () => {
      const { options } = await transportFor(maildev);

      expect(options.connectionTimeout).toBe(10_000);
      expect(options.greetingTimeout).toBe(10_000);
      expect(options.socketTimeout).toBe(20_000);
    });

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

  /**
   * The path production actually runs on. Every SendGrid SMTP port times out
   * from Railway, so the same account is reached over HTTPS instead — which
   * makes these the tests that cover how mail leaves the deployed system.
   */
  describe('the SendGrid API', () => {
    const sendgrid: Record<string, unknown> = {
      NODE_ENV: 'production',
      SENDGRID_API_KEY: 'SG.test-key',
      MAIL_FROM: 'BidNest <no-reply@bidnest.test>'
    };

    let fetchMock: jest.Mock;

    beforeEach(() => {
      // 202 with an empty body is what SendGrid answers when it accepts a
      // message for delivery.
      fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 202 });
      global.fetch = fetchMock;
    });

    /** The request body, parsed back out of what fetch was handed. */
    const sentBody = () => {
      const [, init] = fetchMock.mock.calls[0] as [string, { body: string }];
      return JSON.parse(init.body) as {
        personalizations: { to: { email: string }[] }[];
        from: { email: string; name?: string };
        subject: string;
        content: { type: string; value: string }[];
      };
    };

    // No connection is opened at all on this path, so there is nothing to
    // pool, time out, or close on shutdown.
    it('builds no SMTP transport when the key is set', async () => {
      await transportFor(sendgrid);

      expect(createTransport).not.toHaveBeenCalled();
    });

    it('posts the message to the mail send endpoint with the key', async () => {
      const { service } = await transportFor(sendgrid);

      await service.sendTwoFactorCode('somchai@example.com', '043915', 10);

      const [url, init] = fetchMock.mock.calls[0] as [
        string,
        { method: string; headers: Record<string, string> }
      ];
      expect(url).toBe('https://api.sendgrid.com/v3/mail/send');
      expect(init.method).toBe('POST');
      expect(init.headers.Authorization).toBe('Bearer SG.test-key');
    });

    it('splits MAIL_FROM into the name and address the API expects', async () => {
      const { service } = await transportFor(sendgrid);

      await service.sendTwoFactorCode('somchai@example.com', '043915', 10);

      expect(sentBody().from).toEqual({
        email: 'no-reply@bidnest.test',
        name: 'BidNest'
      });
    });

    it('carries the recipient, subject and code', async () => {
      const { service } = await transportFor(sendgrid);

      await service.sendTwoFactorCode('somchai@example.com', '043915', 10);

      const body = sentBody();
      expect(body.personalizations[0].to).toEqual([
        { email: 'somchai@example.com' }
      ]);
      expect(body.subject).toContain('รหัสยืนยัน');
      expect(body.content[0].value).toContain('043915');
    });

    /**
     * SendGrid names the problem exactly — an unverified sender, a revoked
     * key — and that sentence is the whole value of the log line, so it has to
     * survive into the error.
     */
    it('raises what SendGrid said when it refuses the message', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 403,
        text: () =>
          Promise.resolve(
            '{"errors":[{"message":"The from address does not match a verified Sender Identity"}]}'
          )
      });
      const { service } = await transportFor(sendgrid);
      jest
        .spyOn(service['logger'], 'error')
        .mockImplementation(() => undefined);

      await expect(
        service.sendTwoFactorCode('somchai@example.com', '043915', 10)
      ).rejects.toThrow(/403.*verified Sender Identity/s);
    });

    it('keeps the code out of the log when the API refuses', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve('unauthorized')
      });
      const { service } = await transportFor(sendgrid);
      const error = jest
        .spyOn(service['logger'], 'error')
        .mockImplementation(() => undefined);

      await expect(
        service.sendTwoFactorCode('somchai@example.com', '043915', 10)
      ).rejects.toThrow();

      expect(JSON.stringify(error.mock.calls)).not.toContain('043915');
    });
  });

  describe('parseAddress', () => {
    it('splits a display name from the address', () => {
      expect(parseAddress('BidNest <no-reply@bidnest.test>')).toEqual({
        email: 'no-reply@bidnest.test',
        name: 'BidNest'
      });
    });

    // Valid on both paths, and the shape the API wants for it has no `name`
    // key at all rather than an empty one.
    it('accepts a bare address', () => {
      expect(parseAddress('no-reply@bidnest.test')).toEqual({
        email: 'no-reply@bidnest.test'
      });
    });

    it('trims the padding a copied env value brings with it', () => {
      expect(parseAddress('  BidNest  < no-reply@bidnest.test >  ')).toEqual({
        email: 'no-reply@bidnest.test',
        name: 'BidNest'
      });
    });
  });
});
