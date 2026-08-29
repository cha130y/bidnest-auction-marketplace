import type { Prisma } from '../../generated/prisma/client';
import { maskBidderName } from '../bid/utils/mask-bidder-name.util';

/**
 * LIV-004 — the winning bid, loaded only far enough to name its bidder the
 * way every other public surface names one.
 */
export const settledWinnerSelect = {
  id: true,
  amount: true,
  bidder: { select: { profile: { select: { displayName: true } } } }
} satisfies Prisma.BidSelect;

type SettledWinner = Prisma.BidGetPayload<{
  select: typeof settledWinnerSelect;
}>;

type SettledAuction = {
  id: string;
  sold: boolean;
  endedAt: Date;
  bidCount: number;
  winner: SettledWinner | null;
};

/**
 * LIV-004 / SRS section 6 — what the room is told when an auction ends.
 *
 * Only ever built after the settling transaction has committed. The outcome is
 * final by then: unlike a price, a result cannot be superseded by a later
 * event, so announcing one that a rollback could take back would leave a
 * screen showing a sale that never happened.
 */
export function toAuctionEndedEvent(auction: SettledAuction) {
  return {
    auctionId: auction.id,
    status: auction.sold ? ('SOLD' as const) : ('UNSOLD' as const),
    endedAt: auction.endedAt,
    bidCount: auction.bidCount,
    /**
     * Null unless it sold, because an auction that did not sell has no sale
     * price — not to keep anything back. What the bidding reached is
     * `currentPrice`, which has been public all along, and a room watching
     * `reserveMet` stay false already knew the reserve was above it.
     */
    soldPrice: auction.sold
      ? (auction.winner?.amount.toString() ?? null)
      : null,
    // Masked like every other public mention of a bidder (BID-005), so the
    // person who won reads as the same person who was leading a moment ago.
    winner: auction.sold
      ? maskBidderName(auction.winner?.bidder.profile?.displayName)
      : null
  };
}

/**
 * AUC-003 and SRS section 6, enforced at compile time: none of these may
 * appear in what the room is told. Adding any one of them back stops this line
 * being assignable and the build fails.
 *
 * Written with Extract rather than `'a' | 'b' extends keyof T`, which is a
 * trap: a union on the left asks whether *every* member is a key, so a payload
 * that leaked exactly one of them would still satisfy it.
 */
type AuctionEndedEvent = ReturnType<typeof toAuctionEndedEvent>;
type ForbiddenInEndedEvent = 'reservePrice' | 'winnerUserId' | 'bidderId';
const _endedEventHidesPrivateFields: [
  Extract<keyof AuctionEndedEvent, ForbiddenInEndedEvent>
] extends [never]
  ? true
  : never = true;
void _endedEventHidesPrivateFields;
