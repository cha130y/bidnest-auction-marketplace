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
