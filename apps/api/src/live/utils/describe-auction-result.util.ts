import type { AuctionStatus } from '../../../generated/prisma/enums';

/**
 * LIV-004 — the two ways an auction can be over. Cancelled is not among them:
 * a cancelled auction never reaches a public read (AUC-005), so a result
 * screen never has to describe one.
 */
const SETTLED_STATUSES: AuctionStatus[] = ['SOLD', 'UNSOLD'];

type ResultSource = {
  status: AuctionStatus;
  endedAt: Date | null;
  soldPrice: string | null;
  currentPrice: string;
  bidCount: number;
  reserveMet: boolean;
};

/** Whatever the public bid mapper produces — masked, and never a bidder id. */
type PublicWinner = { amount: string; bidder: string; isYours: boolean };

export type AuctionResult = {
  outcome: 'SOLD' | 'UNSOLD';
  endedAt: Date | null;
  soldPrice: string | null;
  finalPrice: string | null;
  bidCount: number;
  reserveMet: boolean;
  winner: PublicWinner | null;
};

/**
 * LIV-004 — "เมื่อจบแสดงผล Sold/Unsold/ราคาสุดท้าย".
 *
 * Null while the auction is still running, which is what tells a screen to
 * keep showing the arena. A block that existed with empty fields would make
 * "no result yet" and "sold for nothing" look alike.
 */
export function describeAuctionResult(
  auction: ResultSource,
  winner: PublicWinner | null
): AuctionResult | null {
  if (!SETTLED_STATUSES.includes(auction.status)) return null;

  return {
    outcome: auction.status === 'SOLD' ? 'SOLD' : 'UNSOLD',
    endedAt: auction.endedAt,
    soldPrice: auction.soldPrice,
    /**
     * The highest bid the auction reached, whether or not it sold — which is
     * what "ราคาสุดท้าย" means for an auction that did not. Null when nobody
     * bid at all, because a `currentPrice` of 0 there means "no price", not
     * "it went for nothing".
     */
    finalPrice: auction.bidCount > 0 ? auction.currentPrice : null,
    bidCount: auction.bidCount,
    reserveMet: auction.reserveMet,
    // Only a sale has a winner. The top bidder on an unsold auction did not
    // win it, and naming them as though they had would be a lie on screen.
    winner: auction.status === 'SOLD' ? winner : null
  };
}
