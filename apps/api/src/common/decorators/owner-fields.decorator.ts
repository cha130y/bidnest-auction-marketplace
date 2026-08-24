import { SetMetadata } from '@nestjs/common';

export const RETURNS_OWNER_FIELDS = 'returnsOwnerFields';

/**
 * §6 — marks a route that is allowed to return a seller's own private numbers:
 * `reservePrice` (AUC-003) and `negotiationFloor` (PROD-006).
 *
 * Only put this on a route whose query is already scoped to the caller, or
 * which decides per row whether the caller owns the thing. The marker does not
 * grant anything; it stops SensitiveFieldsInterceptor from second-guessing a
 * decision the service already made correctly.
 *
 * Its real job is on the routes that do *not* carry it. Every mapper today
 * separates the owner shape from the public one, and auction.mapper even fails
 * the build if the reserve creeps into the public type — but all of that only
 * protects code that goes through a mapper. A new endpoint returning rows
 * straight from Prisma has nothing standing between it and a leak, and that is
 * the case the interceptor is there for.
 */
export const ReturnsOwnerFields = () => SetMetadata(RETURNS_OWNER_FIELDS, true);
