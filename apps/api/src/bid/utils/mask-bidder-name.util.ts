/**
 * BID-005 — turns a bidder's display name into something a stranger can follow
 * without learning who they are: the first and last character survive, the rest
 * becomes asterisks.
 *
 * Keeping the ends visible is what makes the history readable — the same bidder
 * masks to the same label every time, so a reader can see one person raising
 * their own bid rather than a wall of identical stars. Two people whose names
 * start and end alike do collide, and that is the trade accepted here: the
 * history is for following the bidding, not for identifying anyone.
 */
export function maskBidderName(displayName: string | null | undefined): string {
  const characters = Array.from((displayName ?? '').trim());

  // Nothing to mask and nothing to reveal.
  if (characters.length === 0) return '***';

  // One character is the whole name, so none of it can be shown.
  if (characters.length === 1) return '*';

  // Two would otherwise reveal everything; only the first survives.
  if (characters.length === 2) return `${characters[0]}*`;

  return `${characters[0]}***${characters[characters.length - 1]}`;
}
