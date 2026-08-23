import type { Prisma } from '../../generated/prisma/client';
import { maskBidderName } from './utils/mask-bidder-name.util';

/**
 * BID-005 — the history reads the bidder's profile only to mask it. The id is
 * selected so the service can tell a viewer which bids are theirs, and is
 * dropped again by the mapper below.
 */
export const bidHistorySelect = {
  id: true,
  amount: true,
  sequenceNo: true,
  placedAt: true,
  bidderId: true,
  bidder: { select: { profile: { select: { displayName: true } } } }
} satisfies Prisma.BidSelect;

type BidHistoryRow = Prisma.BidGetPayload<{ select: typeof bidHistorySelect }>;

/**
 * BID-005 — one row of public bid history: how much, when, and a masked label
 * for who. `bidderId` never leaves the server; `isYours` answers the only
 * question a viewer can legitimately ask about identity, which is whether a
 * bid is their own.
 */
export function toPublicBid(bid: BidHistoryRow, viewerId?: string) {
  return {
    id: bid.id,
    amount: bid.amount.toString(),
    sequenceNo: bid.sequenceNo,
    placedAt: bid.placedAt,
    bidder: maskBidderName(bid.bidder.profile?.displayName),
    isYours: viewerId !== undefined && bid.bidderId === viewerId
  };
}

/**
 * BID-005 / SRS section 6, enforced at compile time: a bidder id in the public
 * history would identify people the auction is not meant to name. If it ever
 * reappears in this shape, the build stops.
 */
type PublicBid = ReturnType<typeof toPublicBid>;
const _historyHidesBidderId: 'bidderId' extends keyof PublicBid ? never : true =
  true;
void _historyHidesBidderId;
