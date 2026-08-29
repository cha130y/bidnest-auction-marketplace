import type { UserRole } from '../../../generated/prisma/enums';

/**
 * Why the person looking cannot bid. Each value mirrors a rule BID-001 already
 * enforces on the endpoint — this only reports them ahead of time so a screen
 * can disable its control and say why, instead of letting somebody type an
 * amount and discover the refusal afterwards.
 */
export type BiddingBlock =
  'AUCTION_NOT_OPEN' | 'YOU_ARE_THE_SELLER' | 'ADMINS_DO_NOT_BID';

export type BiddingAccess = {
  canBid: boolean;
  blockedBy: BiddingBlock | null;
};

type ArenaAuction = { biddingOpen: boolean; seller: { id: string } };
type Viewer = { id: string; role: UserRole };

/**
 * LIV-002 — "ปุ่มควบคุมการประมูล", answered from the server.
 *
 * This is a report, never a gate: the endpoint checks all of it again inside
 * the transaction that accepts the bid (BID-002), because anything read here
 * can change between this response and the next request. A `canBid` of true is
 * "nothing is stopping you as of now", not a promise.
 */
export function describeBiddingAccess(
  auction: ArenaAuction,
  viewer: Viewer
): BiddingAccess {
  // The state of the auction first: it is the same answer for everybody in the
  // room, and a personal reason on top of it would only be noise.
  const blockedBy = !auction.biddingOpen
    ? 'AUCTION_NOT_OPEN'
    : viewer.id === auction.seller.id
      ? 'YOU_ARE_THE_SELLER'
      : viewer.role !== 'USER'
        ? 'ADMINS_DO_NOT_BID'
        : null;

  return { canBid: blockedBy === null, blockedBy };
}
