import type { Prisma } from '../../generated/prisma/client';

export const auctionPublicSelect = {
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

// AUC-003 / SRS section 6 — reservePrice is layered on top of the public select,
// never the other way round, so a buyer-facing path cannot leak it by omission.
export const auctionOwnerSelect = {
  ...auctionPublicSelect,
  reservePrice: true
} satisfies Prisma.AuctionSelect;

type PublicAuctionRow = Prisma.AuctionGetPayload<{
  select: typeof auctionPublicSelect;
}>;
type OwnerAuctionRow = Prisma.AuctionGetPayload<{
  select: typeof auctionOwnerSelect;
}>;

export function toPublicAuction(auction: PublicAuctionRow) {
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

export function toOwnerAuction(auction: OwnerAuctionRow) {
  return {
    ...toPublicAuction(auction),
    reservePrice: auction.reservePrice?.toString() ?? null
  };
}

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
