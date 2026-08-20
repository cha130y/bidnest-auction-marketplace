import type { Prisma } from '../../../generated/prisma/client';

/**
 * AUC-008 — the whole ranking, written out. Most accepted bids first, then the
 * one ending soonest, then the auction id.
 *
 * The id is not decoration: without it two auctions with the same bid count and
 * the same end time could come back in either order, and a reader paging
 * through the list would see one twice and miss another.
 *
 * The criteria say "no special flags or hidden scoring", so this is the entire
 * rule — there is nothing else multiplying, boosting or weighting it.
 */
export const HOT_AUCTION_ORDER = [
  { bidCount: 'desc' },
  { currentEndAt: 'asc' },
  { id: 'asc' }
] satisfies Prisma.AuctionOrderByWithRelationInput[];
