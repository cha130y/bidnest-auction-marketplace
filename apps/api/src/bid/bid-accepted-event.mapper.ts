import type { Prisma } from '../../generated/prisma/client';
import { calculateReserveMet } from '../auction/utils/calculate-reserve-met.util';
import { maskBidderName } from './utils/mask-bidder-name.util';

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
  bidder: { profile: { displayName: string | null } | null };
};

/**
 * BID-003 — the payload for `auction:bid`. It carries the public state after
 * the bid plus the computed `reserveMet`, and the reserve itself is read here
 * only to compute that — exactly as the buyer-facing mapper does (AUC-003).
 *
 * The bidder appears as the masked label BID-005 defines, produced by the same
 * function the history uses so the two can never disagree about how a name is
 * hidden. Sending it here rather than only in the history is what keeps a
 * screen consistent with itself: the price and who moved it are one fact, and
 * splitting them across two channels leaves a window where the price has
 * changed but the list under it has not.
 *
 * The bidder id is still never sent, to anyone, on any channel.
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
      placedAt: bid.placedAt,
      bidder: maskBidderName(bid.bidder.profile?.displayName)
    }
  };
}

/**
 * BID-003 / AUC-003 / BID-005, enforced at compile time: neither the reserve
 * nor a bidder id may appear in the broadcast. If either does, these stop being
 * assignable and the build fails — the bidder check reaches inside the nested
 * `bid` object, which is where an id would most plausibly be added by mistake.
 */
type BidAcceptedEvent = ReturnType<typeof toBidAcceptedEvent>;
const _eventHidesReserve: 'reservePrice' extends keyof BidAcceptedEvent
  ? never
  : true = true;
const _eventHidesBidderId: 'bidderId' extends
  keyof BidAcceptedEvent | keyof BidAcceptedEvent['bid']
  ? never
  : true = true;
void _eventHidesReserve;
void _eventHidesBidderId;
