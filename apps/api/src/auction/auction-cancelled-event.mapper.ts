import type { AuctionStatus } from '../../generated/prisma/enums';

type CancelledAuction = {
  id: string;
  status: AuctionStatus;
  endedAt: Date | null;
  cancellationReason: string | null;
};

/**
 * NOT-004 / ADM-001 — what the room is told when an auction is called off.
 *
 * Beyond the events SRS section 5.2 lists as the minimum, and deliberately: an
 * admin may cancel an auction that is ACTIVE, and people bidding in that room
 * would otherwise watch a countdown on something that no longer exists until
 * they happened to reload.
 *
 * The reason is included because it is already public — every bidder and
 * watcher receives it in their notification (NOT-004), so withholding it from
 * the room would hide nothing and only make the screen less useful.
 *
 * Who cancelled it is not: "by an admin" tells a bidder the auction was
 * moderated, which is the seller's business rather than the room's.
 */
export function toAuctionCancelledEvent(auction: CancelledAuction) {
  return {
    auctionId: auction.id,
    status: auction.status,
    endedAt: auction.endedAt,
    reason: auction.cancellationReason
  };
}

/**
 * SRS section 6, enforced at compile time: nothing about who moderated the
 * auction, and nothing about the reserve, may reach a room.
 */
type AuctionCancelledEvent = ReturnType<typeof toAuctionCancelledEvent>;
type ForbiddenInCancelledEvent = 'reservePrice' | 'adminUserId' | 'sellerId';
const _cancelledEventHidesPrivateFields: [
  Extract<keyof AuctionCancelledEvent, ForbiddenInCancelledEvent>
] extends [never]
  ? true
  : never = true;
void _cancelledEventHidesPrivateFields;
