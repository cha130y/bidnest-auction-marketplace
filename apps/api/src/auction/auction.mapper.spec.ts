import { Prisma } from '../../generated/prisma/client';
import { toOwnerAuction, toPublicAuction } from './auction.mapper';

const AUCTION_ID = '00000000-0000-4000-8000-000000000301';
const SELLER_ID = '00000000-0000-4000-8000-000000000002';
const CATEGORY_ID = '00000000-0000-4000-8000-000000000101';

const dec = (value: string | number) => new Prisma.Decimal(value);

/** A row shaped exactly like auctionRowSelect returns it. */
const auctionRow = (
  overrides: {
    currentPrice?: Prisma.Decimal;
    reservePrice?: Prisma.Decimal | null;
    soldPrice?: Prisma.Decimal | null;
    status?: 'ACTIVE' | 'SOLD' | 'UNSOLD';
    bidCount?: number;
  } = {}
) => ({
  id: AUCTION_ID,
  sellerId: SELLER_ID,
  categoryId: CATEGORY_ID,
  title: 'Vintage Seiko 5 Automatic',
  description: 'Serviced last year, original bracelet.',
  condition: 'USED' as const,
  status: 'ACTIVE' as const,
  currency: 'THB',
  startingPrice: dec(3000),
  minBidIncrement: dec(100),
  reservePrice: dec(4500),
  currentPrice: dec(0),
  bidCount: 0,
  scheduledStartAt: new Date('2026-09-01T10:00:00.000Z'),
  originalEndAt: new Date('2026-09-01T12:00:00.000Z'),
  currentEndAt: new Date('2026-09-01T12:00:00.000Z'),
  publishedAt: null,
  startedAt: null,
  endedAt: null,
  extensionCount: 0,
  soldPrice: null as Prisma.Decimal | null,
  cancellationReason: null as string | null,
  createdAt: new Date('2026-08-19T00:00:00.000Z'),
  updatedAt: new Date('2026-08-19T00:00:00.000Z'),
  images: [
    {
      url: 'https://placehold.co/600x400?text=Front',
      position: 0,
      isPrimary: true
    }
  ],
  category: { id: CATEGORY_ID, name: 'Collectibles', slug: 'collectibles' },
  seller: { id: SELLER_ID, profile: { displayName: 'Somchai Shop' } },
  ...overrides
});

/**
 * AUC-003 — the reserve is loaded so reserveMet can be computed, which makes
 * the mapper's output the one place the confidentiality rule can be enforced.
 */
describe('auction.mapper (AUC-003)', () => {
  describe('toPublicAuction', () => {
    it('never returns reservePrice, whatever its value', () => {
      const publicView = toPublicAuction(
        auctionRow({ reservePrice: dec(4500) })
      );

      expect(publicView).not.toHaveProperty('reservePrice');
      expect(JSON.stringify(publicView)).not.toContain('4500');
    });

    it('reports reserveMet false while the price is below the reserve', () => {
      const publicView = toPublicAuction(
        auctionRow({ currentPrice: dec(4499), reservePrice: dec(4500) })
      );

      expect(publicView.reserveMet).toBe(false);
    });

    it('reports reserveMet true once the price reaches the reserve exactly', () => {
      const publicView = toPublicAuction(
        auctionRow({ currentPrice: dec(4500), reservePrice: dec(4500) })
      );

      expect(publicView.reserveMet).toBe(true);
    });

    it('reports reserveMet true above the reserve', () => {
      const publicView = toPublicAuction(
        auctionRow({ currentPrice: dec(5000), reservePrice: dec(4500) })
      );

      expect(publicView.reserveMet).toBe(true);
    });

    // Returning null here would announce "this auction has no reserve", which
    // is itself private — an auction without one looks the same to a buyer.
    it('reports reserveMet true, not null, when there is no reserve', () => {
      const publicView = toPublicAuction(
        auctionRow({ currentPrice: dec(0), reservePrice: null })
      );

      expect(publicView.reserveMet).toBe(true);
      expect(publicView).not.toHaveProperty('reservePrice');
    });

    it('gives the same shape with and without a reserve', () => {
      const withReserve = toPublicAuction(
        auctionRow({ reservePrice: dec(4500) })
      );
      const withoutReserve = toPublicAuction(
        auctionRow({ reservePrice: null })
      );

      expect(Object.keys(withReserve).sort()).toEqual(
        Object.keys(withoutReserve).sort()
      );
    });
  });

  /**
   * LIV-002 — the arena shows the lowest amount that will be accepted, and it
   * has to be the same number BID-001 measures a bid against.
   */
  describe('minimumNextBid', () => {
    it('is the starting price before anybody has bid', () => {
      const publicView = toPublicAuction(
        auctionRow({ currentPrice: dec(0), bidCount: 0 })
      );

      expect(publicView.minimumNextBid).toBe('3000');
    });

    it('is the current price plus the increment once bidding has started', () => {
      const publicView = toPublicAuction(
        auctionRow({ currentPrice: dec(3200), bidCount: 4 })
      );

      expect(publicView.minimumNextBid).toBe('3300');
    });

    // a currentPrice of 0 means "no price yet", not "the price is zero" —
    // reading it literally would let the opening bid come in at one increment
    it('does not let the opening bid undercut the starting price', () => {
      const publicView = toPublicAuction(
        auctionRow({ currentPrice: dec(0), bidCount: 0 })
      );

      expect(Number(publicView.minimumNextBid)).toBeGreaterThanOrEqual(
        Number(publicView.startingPrice)
      );
    });
  });

  describe('toOwnerAuction', () => {
    it('passes the reserve through to the seller who owns it', () => {
      const ownerView = toOwnerAuction(auctionRow({ reservePrice: dec(4500) }));

      expect(ownerView.reservePrice).toBe('4500');
    });

    it('gives the owner reserveMet as well', () => {
      const ownerView = toOwnerAuction(
        auctionRow({ currentPrice: dec(5000), reservePrice: dec(4500) })
      );

      expect(ownerView.reserveMet).toBe(true);
    });

    it('returns null rather than omitting the field when there is no reserve', () => {
      const ownerView = toOwnerAuction(auctionRow({ reservePrice: null }));

      expect(ownerView.reservePrice).toBeNull();
    });
  });
});
