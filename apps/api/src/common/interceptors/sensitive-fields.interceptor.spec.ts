import { CallHandler, ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { firstValueFrom, of } from 'rxjs';
import { SensitiveFieldsInterceptor } from './sensitive-fields.interceptor';
import type { EnvVariable } from '../../config/env.validation';

/**
 * The interceptor is a net under everything else, so what matters is that it
 * catches a field nobody meant to send, and that it never touches a response
 * that was correct — the second half being what makes it safe to run globally.
 */
describe('SensitiveFieldsInterceptor (§6)', () => {
  function build({
    ownerAllowed = false,
    env = 'development'
  }: { ownerAllowed?: boolean; env?: string } = {}) {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(ownerAllowed)
    } as unknown as Reflector;
    const config = {
      get: () => env
    } as unknown as ConfigService<EnvVariable, true>;

    const interceptor = new SensitiveFieldsInterceptor(reflector, config);
    const logger = jest
      .spyOn(interceptor['logger'], 'error')
      .mockImplementation(() => undefined);

    const context = {
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({
        getRequest: () => ({ method: 'GET', url: '/auctions/abc' })
      })
    } as unknown as ExecutionContext;

    const run = (body: unknown) =>
      firstValueFrom(
        interceptor.intercept(context, {
          handle: () => of(body)
        } as CallHandler)
      );

    return { run, logger };
  }

  describe('a response that was already correct', () => {
    it('comes back byte for byte, not a copy', async () => {
      // Identity, not equality: a net that rebuilt every response would be a
      // tax on every request, and would quietly drop anything non-plain.
      const { run } = build();
      const body = { id: 'a1', title: 'ตู้เย็น', currentPrice: '1200.00' };

      await expect(run(body)).resolves.toBe(body);
    });

    it('leaves what is not an object alone', async () => {
      const { run } = build();

      await expect(run(undefined)).resolves.toBeUndefined();
      await expect(run(null)).resolves.toBeNull();
      await expect(run('ok')).resolves.toBe('ok');
    });

    it('keeps Dates and Decimals whole rather than walking into them', async () => {
      const { run } = build();
      const createdAt = new Date('2026-08-24T00:00:00.000Z');
      const body = { createdAt };

      const result = (await run(body)) as { createdAt: Date };
      expect(result.createdAt).toBe(createdAt);
    });
  });

  describe('the seller-only numbers', () => {
    it('removes a reserve from a route that did not ask to send one', async () => {
      const { run, logger } = build();

      const result = (await run({
        id: 'a1',
        reservePrice: '5000.00'
      })) as Record<string, unknown>;

      expect(result).not.toHaveProperty('reservePrice');
      expect(result.id).toBe('a1');
      // The route has to be nameable, or nobody can go and fix it.
      expect(logger.mock.calls[0][0]).toContain('GET /auctions/abc');
      expect(logger.mock.calls[0][0]).toContain('reservePrice');
    });

    it('removes a negotiation floor the same way', async () => {
      const { run } = build();

      const result = (await run({ negotiationFloor: '900.00' })) as object;

      expect(result).not.toHaveProperty('negotiationFloor');
    });

    it('lets both through on a route marked @ReturnsOwnerFields', async () => {
      const { run, logger } = build({ ownerAllowed: true });
      const body = { reservePrice: '5000.00', negotiationFloor: '900.00' };

      await expect(run(body)).resolves.toBe(body);
      expect(logger).not.toHaveBeenCalled();
    });

    it('reaches them inside arrays and nested objects', async () => {
      const { run } = build();

      const result = (await run({
        items: [{ id: 'a1', auction: { reservePrice: '1.00' } }]
      })) as { items: { auction: Record<string, unknown> }[] };

      expect(result.items[0].auction).not.toHaveProperty('reservePrice');
      expect(result.items[0]).toMatchObject({ id: 'a1' });
    });
  });

  describe('credential digests', () => {
    it.each([
      'passwordHash',
      'refreshTokenHash',
      'codeHash',
      'tokenHash',
      'resetTokenHash'
    ])('removes %s even where owner fields are allowed', async (field) => {
      // No opt-out for these: not for the account they belong to, not for an
      // admin. There is no caller who has any use for a digest.
      const { run } = build({ ownerAllowed: true });

      const result = (await run({ id: 'u1', [field]: '$2b$12$abc' })) as object;

      expect(result).not.toHaveProperty(field);
      expect(JSON.stringify(result)).not.toContain('$2b$');
    });
  });

  describe('under test', () => {
    it('throws rather than quietly cleaning up', async () => {
      // A leak that only writes a log line is a leak that ships. The suite has
      // to fail on it, which is what makes this net worth having.
      const { run } = build({ env: 'test' });

      await expect(run({ reservePrice: '5000.00' })).rejects.toThrow(
        /reservePrice/
      );
    });
  });

  it('survives a row that refers back to itself', async () => {
    const { run } = build();
    const auction: Record<string, unknown> = { id: 'a1' };
    auction.self = auction;

    await expect(run({ auction })).resolves.toBeDefined();
  });
});
