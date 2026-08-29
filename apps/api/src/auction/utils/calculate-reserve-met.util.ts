import type { Prisma } from '../../../generated/prisma/client';

/**
 * AUC-003 — the only thing about the reserve that may ever leave the server on
 * a buyer-facing path: whether the current price has met it. The reserve itself
 * is never sent or broadcast, and nothing derived from it is stored (there is
 * deliberately no `reserve_met_at` column — the value is computed on read).
 *
 * An auction with no reserve returns `true`, not `null`. Returning `null` would
 * itself be the leak: it announces "this auction has no reserve", which is as
 * private as the amount. A buyer sees the same shape either way.
 */
export function calculateReserveMet(
  currentPrice: Prisma.Decimal,
  reservePrice: Prisma.Decimal | null
): boolean {
  if (reservePrice === null) return true;

  return currentPrice.gte(reservePrice);
}
