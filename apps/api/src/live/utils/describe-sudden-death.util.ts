import {
  ANTI_SNIPING_EXTENSION_MS,
  ANTI_SNIPING_WINDOW_MS,
  MAX_EXTENSIONS
} from '../../bid/utils/calculate-anti-sniping.util';

/** The extension that moved the deadline most recently, if any has. */
export type LastExtension = {
  extensionNumber: number;
  previousEndAt: Date;
  newEndAt: Date;
  /**
   * LIV-003 — the bid that caused it, which is what makes the panel say
   * something rather than assert something: "this amount moved the deadline
   * to that time" is checkable by the person reading it.
   *
   * Read through the `triggeredByBid` relation the schema already keeps, not
   * from `currentPrice` — later bids move that, and the extension would then
   * appear to have been caused by an amount that came after it.
   */
  triggeringBid: string;
};

export type SuddenDeath = {
  active: boolean;
  windowMs: number;
  extensionMs: number;
  extensionCount: number;
  extensionsRemaining: number;
  lastExtension: LastExtension | null;
};

type SuddenDeathSource = {
  biddingOpen: boolean;
  currentEndAt: Date | null;
  extensionCount: number;
};

/**
 * LIV-003 — the urgent state, answered from the server.
 *
 * Everything here is derived from BID-004's own constants, so the moment the
 * screen turns urgent is the moment a bid would actually extend the auction.
 * A frontend hard-coding "two minutes" would be describing a rule it does not
 * own, and would go quietly wrong the day that rule changes.
 */
export function describeSuddenDeath(
  auction: SuddenDeathSource,
  lastExtension: LastExtension | null,
  now: Date
): SuddenDeath {
  const remainingMs =
    auction.currentEndAt === null
      ? null
      : auction.currentEndAt.getTime() - now.getTime();

  return {
    /**
     * Deliberately still true once the five extensions are spent. That is the
     * only moment the auction really is about to end, so turning the urgency
     * off exactly then would be backwards — `extensionsRemaining: 0` is what
     * says there is no reprieve left.
     */
    active:
      auction.biddingOpen &&
      remainingMs !== null &&
      remainingMs > 0 &&
      remainingMs <= ANTI_SNIPING_WINDOW_MS,
    // Sent rather than assumed, so a countdown can shade the final stretch and
    // a screen can say "a bid now adds two minutes" without knowing the number.
    windowMs: ANTI_SNIPING_WINDOW_MS,
    extensionMs: ANTI_SNIPING_EXTENSION_MS,
    extensionCount: auction.extensionCount,
    // Clamped: a row that somehow holds more than the cap should read as none
    // left rather than as a negative number on screen.
    extensionsRemaining: Math.max(0, MAX_EXTENSIONS - auction.extensionCount),
    lastExtension
  };
}
