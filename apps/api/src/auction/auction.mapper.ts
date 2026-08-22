import type { Prisma } from '../../generated/prisma/client';
import { calculateMinimumBid } from '../bid/utils/calculate-minimum-bid.util';
import { calculateReserveMet } from './utils/calculate-reserve-met.util';

/**
 * The one field set every auction read uses. `reservePrice` is part of it
 * because AUC-003 requires `reserveMet` to be computed on read — the reserve
 * has to be loaded to be compared against.
 *
 * That is why the confidentiality guard lives on the way OUT, in the mappers
 * below, rather than on this select: `toPublicAuction()` drops the reserve
 * every time, and `toOwnerAuction()` is the only function that passes it
 * through. A single output funnel is checkable; a select that omits the field
 * would just push the computation somewhere else.
 */
export const auctionRowSelect = {
  id: true,
  sellerId: true,
  categoryId: true,
  title: true,
  description: true,
  condition: true,
  status: true,
  currency: true,
  startingPrice: true,
  minBidIncrement: true,
  reservePrice: true,
  currentPrice: true,
  bidCount: true,
  scheduledStartAt: true,
  originalEndAt: true,
  currentEndAt: true,
  publishedAt: true,
  startedAt: true,
  endedAt: true,
  extensionCount: true,
  createdAt: true,
  updatedAt: true,
  images: {
    select: { url: true, position: true, isPrimary: true },
    orderBy: { position: 'asc' }
  },
  category: { select: { id: true, name: true, slug: true } },
  seller: { select: { id: true, profile: { select: { displayName: true } } } }
} satisfies Prisma.AuctionSelect;

type AuctionRow = Prisma.AuctionGetPayload<{ select: typeof auctionRowSelect }>;

/**
 * AUC-003 — what a buyer is allowed to see. The reserve is replaced by the
 * computed `reserveMet`; the amount itself never appears in the returned
 * object, and nothing else here is derived from it.
 */
export function toPublicAuction(auction: AuctionRow) {
  return {
    id: auction.id,
    title: auction.title,
    description: auction.description,
    condition: auction.condition,
    status: auction.status,
    currency: auction.currency.trim(),
    startingPrice: auction.startingPrice.toString(),
    minBidIncrement: auction.minBidIncrement.toString(),
    currentPrice: auction.currentPrice.toString(),
    /**
     * LIV-002 — the lowest amount this auction will take right now, computed
     * by the same function BID-001 rejects bids with, so a screen cannot offer
     * an amount the endpoint will refuse.
     *
     * Here rather than only on the arena for the reason `biddingOpen` is here:
     * the opening bid is measured against the starting price, not against a
     * `currentPrice` of 0, and a frontend deriving that rule from the fields
     * would get it wrong on the first bid of every auction.
     */
    minimumNextBid: calculateMinimumBid(auction).toString(),
    reserveMet: calculateReserveMet(auction.currentPrice, auction.reservePrice),
    // AUC-005 — a SCHEDULED auction is public to look at, but bidding only
    // opens once it turns ACTIVE. Saying so here keeps the frontend from
    // deriving the rule from `status` on its own and getting it wrong.
    biddingOpen: auction.status === 'ACTIVE',
    bidCount: auction.bidCount,
    scheduledStartAt: auction.scheduledStartAt,
    originalEndAt: auction.originalEndAt,
    currentEndAt: auction.currentEndAt,
    publishedAt: auction.publishedAt,
    startedAt: auction.startedAt,
    endedAt: auction.endedAt,
    extensionCount: auction.extensionCount,
    category: auction.category,
    seller: {
      id: auction.seller.id,
      displayName: auction.seller.profile?.displayName ?? null
    },
    images: auction.images.map((image) => ({
      url: image.url,
      position: image.position,
      isPrimary: image.isPrimary
    })),
    createdAt: auction.createdAt,
    updatedAt: auction.updatedAt
  };
}

/**
 * The seller's own view. Only reached from a query already scoped by sellerId,
 * which is what makes returning the reserve here safe.
 */
export function toOwnerAuction(auction: AuctionRow) {
  return {
    ...toPublicAuction(auction),
    reservePrice: auction.reservePrice?.toString() ?? null
  };
}

/**
 * AUC-003, enforced at compile time: if `reservePrice` ever appears in what
 * toPublicAuction returns, this line stops being assignable and the build
 * fails. A reviewer adding the field back cannot merge past it.
 */
type PublicAuction = ReturnType<typeof toPublicAuction>;
const _publicAuctionHidesReserve: 'reservePrice' extends keyof PublicAuction
  ? never
  : true = true;
void _publicAuctionHidesReserve;

// AUC-002 — the publish gate reads only the fields the acceptance criteria
// measure, so a validation call skips the seller/category/image joins the
// buyer-facing selects need.
export const auctionPublishGateSelect = {
  id: true,
  title: true,
  description: true,
  condition: true,
  startingPrice: true,
  minBidIncrement: true,
  reservePrice: true,
  scheduledStartAt: true,
  originalEndAt: true,
  category: { select: { isActive: true } },
  images: { select: { id: true } }
} satisfies Prisma.AuctionSelect;
