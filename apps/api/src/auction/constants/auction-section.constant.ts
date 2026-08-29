import type { Prisma } from '../../../generated/prisma/client';
import { HOT_AUCTION_ORDER } from './hot-auction-order.constant';

/**
 * The browse sections the home page is built from.
 *
 * Only `hot` is asked for by the SRS (AUC-008). The other three come from the
 * home page design — four cards: hot, ending soon, starting soon, recently
 * ended — and are grouped here rather than given routes of their own so that a
 * caller picks a section *by name* and nothing else.
 *
 * That is the point: there is no `sort`, `status` or `order` parameter to
 * combine, so AUC-008's "no special flags or hidden scoring" stays true of the
 * endpoint as a whole rather than only of its default.
 */
export const AUCTION_SECTIONS = [
  'hot',
  'ending-soon',
  'starting-soon',
  'recently-ended'
] as const;

export type AuctionSection = (typeof AUCTION_SECTIONS)[number];

/** AUC-008 — asking for no section is asking for the hot list, unchanged. */
export const DEFAULT_AUCTION_SECTION: AuctionSection = 'hot';

type SectionQuery = {
  where: Prisma.AuctionWhereInput;
  orderBy: Prisma.AuctionOrderByWithRelationInput[];
};

/**
 * Every section ends on the auction id for the reason HOT_AUCTION_ORDER
 * explains: two auctions sharing a timestamp could otherwise come back in
 * either order, and a reader paging through would see one twice and miss
 * another.
 *
 * `deletedAt: null` is deliberately *not* repeated in each entry — the service
 * applies it to every section, so a section added later cannot forget it.
 *
 * Every status named here is in PUBLIC_AUCTION_STATUSES (AUC-005), and a test
 * holds that true: a section is a way of arranging what a buyer may already
 * see, never a way to reach something else.
 */
export const AUCTION_SECTION_QUERIES: Record<AuctionSection, SectionQuery> = {
  /** AUC-008, untouched — the ranking still lives in its own constant. */
  hot: {
    where: { status: 'ACTIVE' },
    orderBy: HOT_AUCTION_ORDER
  },

  /**
   * Running, closest deadline first. `currentEndAt` rather than
   * `originalEndAt`, so an auction pushed back by anti-sniping (BID-004) moves
   * down the list instead of claiming to be about to close.
   */
  'ending-soon': {
    where: { status: 'ACTIVE' },
    orderBy: [{ currentEndAt: 'asc' }, { id: 'asc' }]
  },

  /** Published but not open yet, soonest to open first. */
  'starting-soon': {
    where: { status: 'SCHEDULED' },
    orderBy: [{ scheduledStartAt: 'asc' }, { id: 'asc' }]
  },

  /**
   * Finished, most recent first. `endedAt` is when settlement actually
   * recorded the outcome (AUC-007), which is the honest answer to "recently
   * ended"; `currentEndAt` is only when it was *due* to end.
   *
   * `nulls: 'last'` is not decoration: the column is nullable and Postgres
   * puts nulls first on a descending sort, so a row missing one would lead a
   * list of the newest results. Said outright rather than left to the filter.
   *
   * On the query plan, because the obvious worry is worth answering: the
   * `auctions_status_ended_at_idx` index narrows the rows, but this section
   * still ends in a Sort. Two statuses mean `status = ANY(...)`, which
   * Postgres reads through a bitmap scan, and a bitmap scan has no order to
   * hand on. Measured on this database: a single status gives
   * `Index Scan Backward` + `Incremental Sort`, both statuses give
   * `Bitmap Heap Scan` + `Sort`, and neither adding `IS NOT NULL` nor
   * dropping `nulls: 'last'` changes that. So the sort here is the price of
   * the two statuses, not of the null handling, and `nulls: 'last'` costs
   * nothing — but it would, if this section were ever narrowed to one.
   */
  'recently-ended': {
    where: { status: { in: ['SOLD', 'UNSOLD'] } },
    orderBy: [{ endedAt: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }]
  }
};
