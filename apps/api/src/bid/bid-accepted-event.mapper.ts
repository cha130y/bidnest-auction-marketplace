import type { Prisma } from '../../generated/prisma/client';
import { calculateReserveMet } from '../auction/utils/calculate-reserve-met.util';

/** What the broadcast needs to know about the auction the bid landed on. */
export type AuctionAfterBid = {
  id: string;
  currency: string;
  currentPrice: Prisma.Decimal;
  reservePrice: Prisma.Decimal | null;
  bidCount: number;
  currentEndAt: Date | null;
  extensionCount: number;
};

export type AcceptedBidForEvent = {
  id: string;
  amount: Prisma.Decimal;
  sequenceNo: number;
  placedAt: Date;
};

/**
 * BID-003 — the payload for `auction:bid`. It carries the public state after
 * the bid plus the computed `reserveMet`, and the reserve itself is read here
 * only to compute that — exactly as the buyer-facing mapper does (AUC-003).
 *
 * The bidder is not named. BID-005 will publish masked names in the history;
 * until that rule exists, a bidder id in a room anyone may join would be a
 * disclosure nobody asked for.
 */
export function toBidAcceptedEvent(
  auction: AuctionAfterBid,
  bid: AcceptedBidForEvent
) {
  return {
    auctionId: auction.id,
    currency: auction.currency.trim(),
    currentPrice: auction.currentPrice.toString(),
    reserveMet: calculateReserveMet(auction.currentPrice, auction.reservePrice),
    bidCount: auction.bidCount,
    currentEndAt: auction.currentEndAt,
    extensionCount: auction.extensionCount,
    bid: {
      id: bid.id,
      amount: bid.amount.toString(),
      sequenceNo: bid.sequenceNo,
      placedAt: bid.placedAt
    }
  };
}

/**
 * BID-003 / AUC-003, enforced at compile time: if the reserve ever appears in
 * the broadcast payload, this stops being assignable and the build fails.
 */
type BidAcceptedEvent = ReturnType<typeof toBidAcceptedEvent>;
const _eventHidesReserve: 'reservePrice' extends keyof BidAcceptedEvent
  ? never
  : true = true;
void _eventHidesReserve;
