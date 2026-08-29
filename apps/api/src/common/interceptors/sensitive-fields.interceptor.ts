import {
  CallHandler,
  ExecutionContext,
  Injectable,
  InternalServerErrorException,
  Logger,
  NestInterceptor
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { Observable, map } from 'rxjs';
import { RETURNS_OWNER_FIELDS } from '../decorators/owner-fields.decorator';
import { EnvVariable } from '../../config/env.validation';

/**
 * §6 — the last thing between a response and the wire.
 *
 * Every read path already withholds what it should: the mappers keep an owner
 * shape apart from a public one, and auction.mapper fails the build outright if
 * the reserve appears in the public type. None of that helps a route that never
 * calls a mapper. Somebody adding an endpoint six days from now, returning rows
 * the way Prisma handed them over, has nothing to stop them — and the field
 * they leak is the seller's floor price, which is the whole point of AUC-003
 * and PROD-006.
 *
 * So this is a net, not the mechanism. It is meant never to catch anything.
 *
 * Two tiers, because they are not the same promise:
 *
 *   NEVER       Credential digests. No route may return one, to anybody,
 *               including the account they belong to and including an admin.
 *               There is no way to opt out of this one.
 *
 *   OWNER_ONLY  The seller's private numbers. Legitimate on a route already
 *               scoped to that seller, which says so with @ReturnsOwnerFields.
 *
 * What it does when it finds one depends on where it is running. Under test it
 * throws, because a leak that only writes a log line is a leak that ships. In
 * development and production it removes the field and logs the route, so a
 * live request degrades rather than exposes.
 */

/** Digests. Nobody is ever allowed to read one back. */
const NEVER = new Set([
  'passwordHash',
  'refreshTokenHash',
  'codeHash',
  'tokenHash',
  'resetTokenHash'
]);

/** The seller's own numbers — AUC-003 and PROD-006. */
const OWNER_ONLY = new Set(['reservePrice', 'negotiationFloor']);

/** Deep enough for the nested shapes in use, shallow enough to stay cheap. */
const MAX_DEPTH = 8;

@Injectable()
export class SensitiveFieldsInterceptor implements NestInterceptor {
  private readonly logger = new Logger(SensitiveFieldsInterceptor.name);
  private readonly throwOnLeak: boolean;

  constructor(
    private readonly reflector: Reflector,
    config: ConfigService<EnvVariable, true>
  ) {
    this.throwOnLeak = config.get('NODE_ENV', { infer: true }) === 'test';
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const ownerAllowed = this.reflector.getAllAndOverride<boolean>(
      RETURNS_OWNER_FIELDS,
      [context.getHandler(), context.getClass()]
    );

    const forbidden = ownerAllowed ? NEVER : new Set([...NEVER, ...OWNER_ONLY]);

    return next.handle().pipe(
      map((body: unknown) => {
        const found: string[] = [];
        const cleaned = this.scrub(body, forbidden, found, 0, new WeakSet());

        if (found.length === 0) return body;

        const request = context.switchToHttp().getRequest<{
          method?: string;
          url?: string;
        }>();
        const route = `${request?.method ?? '?'} ${request?.url ?? '?'}`;
        const fields = [...new Set(found)].join(', ');

        // Logged before the throw, not instead of it. AllExceptionsFilter
        // turns a 500 into a bare message on the way out — by design, since
        // §6 forbids leaking internals to a caller — so the name of the field
        // and the route it came from would otherwise reach nobody at all.
        this.logger.error(
          `${route} produced sensitive field(s): ${fields}. Return the public ` +
            'shape, or mark the route @ReturnsOwnerFields if the caller owns ' +
            'the record.'
        );

        if (this.throwOnLeak) {
          throw new InternalServerErrorException(
            `Response from ${route} carried sensitive field(s): ${fields}`
          );
        }

        return cleaned;
      })
    );
  }

  /**
   * Returns a copy without the forbidden keys, recording what it removed.
   *
   * Copies rather than deletes in place: the value may be a cached row or one
   * another request is also holding, and quietly emptying it would turn a
   * response bug into a data bug. `seen` guards the cycles that a Prisma result
   * with back-references can contain.
   */
  private scrub(
    value: unknown,
    forbidden: Set<string>,
    found: string[],
    depth: number,
    seen: WeakSet<object>
  ): unknown {
    if (depth > MAX_DEPTH || value === null || typeof value !== 'object') {
      return value;
    }
    if (seen.has(value)) return value;

    // Dates, Decimals, Buffers and the like are values, not shapes to walk.
    if (
      value instanceof Date ||
      value instanceof Buffer ||
      !(
        Array.isArray(value) ||
        Object.getPrototypeOf(value) === Object.prototype
      )
    ) {
      return value;
    }

    seen.add(value);

    if (Array.isArray(value)) {
      return value.map((item) =>
        this.scrub(item, forbidden, found, depth + 1, seen)
      );
    }

    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (forbidden.has(key)) {
        found.push(key);
        continue;
      }
      result[key] = this.scrub(item, forbidden, found, depth + 1, seen);
    }
    return result;
  }
}
