import type { Prisma } from '../../generated/prisma/client';
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
    reserveMet: calculateReserveMet(auction.currentPrice, auction.reservePrice),
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
