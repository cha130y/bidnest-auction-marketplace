/**
 * BID-004 — a bid inside the last two minutes pushes the end out by two more,
 * up to five times.
 *
 * The window and the extension are the same length on purpose: a sniper who
 * bids with one second left buys everyone else two full minutes to answer, so
 * winning by arriving last stops working. The cap is what keeps that from
 * running for ever — after five extensions the auction ends on schedule even
 * if bids keep coming.
 */
export const ANTI_SNIPING_WINDOW_MS = 2 * 60 * 1000;
export const ANTI_SNIPING_EXTENSION_MS = 2 * 60 * 1000;
export const MAX_EXTENSIONS = 5;

export type ExtensionDecision =
  | { extends: false }
  | {
      extends: true;
      previousEndAt: Date;
      newEndAt: Date;
      extensionNumber: number;
    };

/**
 * Decides whether a bid arriving now extends the auction, and by how much.
 *
 * `now` is passed in rather than read here so the caller judges the bid and
 * the extension against a single instant, and so the rule is testable without
 * waiting for a clock.
 */
export function calculateAntiSniping(
  auction: { currentEndAt: Date; extensionCount: number },
  now: Date
): ExtensionDecision {
  const remainingMs = auction.currentEndAt.getTime() - now.getTime();

  // Outside the window there is nothing to protect against.
  if (remainingMs > ANTI_SNIPING_WINDOW_MS) return { extends: false };

  // The cap counts extensions already granted, not bids: a late auction can
  // take any number of bids once its five extensions are spent.
  if (auction.extensionCount >= MAX_EXTENSIONS) return { extends: false };

  return {
    extends: true,
    previousEndAt: auction.currentEndAt,
    // Measured from the end time, not from now: two bids a second apart in the
    // same window must not each push the end two minutes past themselves.
    newEndAt: new Date(
      auction.currentEndAt.getTime() + ANTI_SNIPING_EXTENSION_MS
    ),
    extensionNumber: auction.extensionCount + 1
  };
}
