import type { Prisma } from '../../generated/prisma/client';

/**
 * NOT-001..004 — the rows the auction side raises.
 *
 * Pure builders rather than a service: every one of these has to be written
 * inside the transaction that caused it (SRS section 6), so the flow that owns
 * that transaction does the writing. All this decides is what a row says.
 *
 * They live next to the auction because that is what they are all about, and
 * are imported by the bid flow the same way it already imports the auction's
 * status constants.
 */
type NotificationRow = Prisma.NotificationCreateManyInput;

type AuctionRef = {
  id: string;
  title: string;
  currency: string;
};

/** Money as a person reads it: `THB 5,000.00`. */
function money(currency: string, amount: Prisma.Decimal | string): string {
  const value = Number(amount);

  return `${currency.trim()} ${value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

/** Auction titles are up to 200 characters; a message has room for 800. */
function name(auction: AuctionRef): string {
  return `“${auction.title}”`;
}

/**
 * NOT-001 — somebody has been outbid.
 *
 * Raised for the person who was leading a moment ago, and only for them: a
 * bidder further down the list was outbid when the bid above them landed, not
 * now, and telling them again every time the price moves would make the bell
 * useless.
 *
 * `bidId` is the bid that displaced them, so the bell can open the auction at
 * the moment it happened.
 */
export function outbidNotification(
  auction: AuctionRef,
  userId: string,
  bidId: string,
  newPrice: Prisma.Decimal
): NotificationRow {
  return {
    userId,
    auctionId: auction.id,
    bidId,
    type: 'OUTBID',
    title: 'You have been outbid',
    message: `Somebody bid ${money(auction.currency, newPrice)} on ${name(auction)}. Bid again to take the lead.`
  };
}

/** NOT-002 — the winner. Only ever one per auction, and only when it sold. */
export function auctionWonNotification(
  auction: AuctionRef,
  userId: string,
  bidId: string,
  soldPrice: Prisma.Decimal
): NotificationRow {
  return {
    userId,
    auctionId: auction.id,
    bidId,
    type: 'AUCTION_WON',
    title: 'You won the auction',
    message: `You won ${name(auction)} for ${money(auction.currency, soldPrice)}.`
  };
}

/**
 * NOT-003 — an auction finished, for everybody with a stake in it who did not
 * win: the seller, whoever bid without winning, and whoever was watching.
 *
 * The winner is deliberately not among them — they get NOT-002 instead, and
 * two rows about the same event would read as a mistake.
 */
export function auctionEndedNotification(
  auction: AuctionRef,
  userId: string,
  outcome: { sold: boolean; finalPrice: Prisma.Decimal | null }
): NotificationRow {
  const ending = outcome.sold
    ? `sold for ${money(auction.currency, outcome.finalPrice!)}`
    : outcome.finalPrice === null
      ? 'ended without a single bid'
      : `ended without meeting its reserve`;

  return {
    userId,
    auctionId: auction.id,
    type: 'AUCTION_ENDED',
    title: 'An auction you followed has ended',
    message: `${name(auction)} ${ending}.`
  };
}

/**
 * NOT-004 — an auction was called off. Everybody who bid on it or was watching
 * hears, because they were waiting on something that is no longer going to
 * happen.
 *
 * The reason is included when one was given: "cancelled" without a why is the
 * kind of notification people write support tickets about.
 *
 * Who called it off is deliberately left out. The same row goes to a seller
 * withdrawing their own listing (AUC-006) and to an auction a moderator pulled
 * (ADM-001), so naming an actor would be wrong half the time — and telling
 * every bidder that a listing was moderated says something about the seller
 * that the bidders have no business being told.
 */
export function auctionCancelledNotification(
  auction: AuctionRef,
  userId: string,
  reason?: string | null
): NotificationRow {
  const because = reason?.trim() ? ` Reason: ${reason.trim()}` : '';

  return {
    userId,
    auctionId: auction.id,
    type: 'AUCTION_CANCELLED',
    title: 'An auction you followed was cancelled',
    message: `${name(auction)} has been cancelled.${because}`
  };
}
