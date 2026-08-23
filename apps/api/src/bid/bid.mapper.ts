import type { Prisma } from '../../generated/prisma/client';

export const bidSelect = {
  id: true,
  auctionId: true,
  bidderId: true,
  amount: true,
  sequenceNo: true,
  clientRequestId: true,
  placedAt: true
} satisfies Prisma.BidSelect;

/**
 * BID-003 — the same fields plus the bidder's profile, which the broadcast
 * needs in order to mask a name (BID-005). Only the write path uses it: a
 * replayed retry announces nothing, so it has no reason to join the profile.
 */
export const bidWithBidderSelect = {
  ...bidSelect,
  bidder: { select: { profile: { select: { displayName: true } } } }
} satisfies Prisma.BidSelect;

type BidRow = Prisma.BidGetPayload<{ select: typeof bidSelect }>;

/**
 * What the bidder gets back for their own bid. `bidderId` is theirs, so it is
 * not a disclosure — BID-005 is where other people's bids get masked.
 */
export function toOwnBid(bid: BidRow) {
  return {
    id: bid.id,
    auctionId: bid.auctionId,
    bidderId: bid.bidderId,
    amount: bid.amount.toString(),
    sequenceNo: bid.sequenceNo,
    clientRequestId: bid.clientRequestId,
    placedAt: bid.placedAt
  };
}
