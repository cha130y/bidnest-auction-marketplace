import { validate } from './env.validation';

/** The four the schema has no default for; everything else may be absent. */
const required = {
  PORT: '4000',
  DATABASE_URL: 'postgresql://u:p@localhost:5433/db',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32)
};

describe('env validation', () => {
  describe('mail', () => {
    it('starts on a copy of .env.example, blank placeholders and all', () => {
      // The failure this guards against is not subtle: a blank MAIL_SECURE
      // parsed as an enum would refuse to start, and the first person to copy
      // the example file would meet it.
      const env = validate({
        ...required,
        MAIL_USER: '',
        MAIL_PASSWORD: '',
        MAIL_SECURE: ''
      });

      expect(env.MAIL_USER).toBeUndefined();
      expect(env.MAIL_PASSWORD).toBeUndefined();
      expect(env.MAIL_SECURE).toBeUndefined();
    });

    it('leaves the mail settings on Maildev when none are named', () => {
      const env = validate(required);

      expect(env.MAIL_HOST).toBe('localhost');
      expect(env.MAIL_PORT).toBe(1025);
      expect(env.MAIL_USER).toBeUndefined();
    });

    it('carries a relay login through', () => {
      const env = validate({
        ...required,
        MAIL_HOST: 'smtp.resend.com',
        MAIL_PORT: '587',
        MAIL_USER: 'resend',
        MAIL_PASSWORD: 're_secret'
      });

      expect(env.MAIL_HOST).toBe('smtp.resend.com');
      expect(env.MAIL_PORT).toBe(587);
      expect(env.MAIL_USER).toBe('resend');
      expect(env.MAIL_PASSWORD).toBe('re_secret');
    });

    it('reads MAIL_SECURE as a boolean, not a string', () => {
      // "false" is truthy as a string, which is the trap this is here for.
      expect(validate({ ...required, MAIL_SECURE: 'false' }).MAIL_SECURE).toBe(
        false
      );
      expect(validate({ ...required, MAIL_SECURE: 'true' }).MAIL_SECURE).toBe(
        true
      );
      expect(validate({ ...required, MAIL_SECURE: 'TRUE' }).MAIL_SECURE).toBe(
        true
      );
    });
  });

  it('refuses to start on a short signing secret', () => {
    // AUTH-002/AUTH-004 — the one class of misconfiguration that must stop the
    // app rather than degrade it.
    expect(() => validate({ ...required, JWT_ACCESS_SECRET: 'short' })).toThrow(
      'Env validation failed'
    );
  });
});
