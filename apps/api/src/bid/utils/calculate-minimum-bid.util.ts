import type { Prisma } from '../../../generated/prisma/client';

/** What an auction needs to have on it before a minimum bid can be worked out. */
export type MinimumBidBasis = {
  startingPrice: Prisma.Decimal;
  minBidIncrement: Prisma.Decimal;
  currentPrice: Prisma.Decimal;
  bidCount: number;
};

/**
 * BID-001 — the lowest amount this auction will accept right now.
 *
 * The criterion reads "at least the current price plus the increment", which
 * describes an auction that already has bids. Before the first one, bidnest
 * stores `currentPrice` as 0 (the column defaults to it and nothing sets it at
 * publish), so applying that formula literally would let the opening bid come
 * in at one increment — below the starting price the seller set.
 *
 * A zero there does not mean "the price is zero", it means "no price yet", so
 * the opening bid is measured against the starting price instead. From the
 * second bid on, the formula is exactly what the criterion says.
 */
export function calculateMinimumBid(auction: MinimumBidBasis): Prisma.Decimal {
  if (auction.bidCount === 0) return auction.startingPrice;

  return auction.currentPrice.plus(auction.minBidIncrement);
}
