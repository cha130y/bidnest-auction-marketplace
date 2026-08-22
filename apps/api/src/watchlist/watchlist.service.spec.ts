import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WatchlistService } from './watchlist.service';

const AUCTION_ID = '00000000-0000-4000-8000-000000000701';
const OTHER_AUCTION_ID = '00000000-0000-4000-8000-000000000702';
const USER_ID = '00000000-0000-4000-8000-000000000703';
const SELLER_ID = '00000000-0000-4000-8000-000000000704';

const WATCHED_AT = new Date('2026-09-01T09:00:00.000Z');
const ENDS_AT = new Date('2026-09-01T12:00:00.000Z');

const dec = (value: string | number) => new Prisma.Decimal(value);

/** An auction row shaped exactly like auctionRowSelect returns it. */
const auctionRow = (overrides: Record<string, unknown> = {}) => ({
  id: AUCTION_ID,
  sellerId: SELLER_ID,
  categoryId: '00000000-0000-4000-8000-000000000101',
  title: 'Vintage Seiko 5 Automatic',
  description: 'Serviced last year.',
  condition: 'USED' as const,
  status: 'ACTIVE' as const,
  currency: 'THB',
  startingPrice: dec(3000),
  minBidIncrement: dec(100),
  reservePrice: dec(4500),
  currentPrice: dec(3500),
  bidCount: 2,
  scheduledStartAt: new Date('2026-09-01T08:00:00.000Z'),
  originalEndAt: ENDS_AT,
  currentEndAt: ENDS_AT,
  publishedAt: WATCHED_AT,
  startedAt: WATCHED_AT,
  endedAt: null,
  extensionCount: 0,
  soldPrice: null as Prisma.Decimal | null,
  createdAt: WATCHED_AT,
  updatedAt: WATCHED_AT,
  images: [],
  category: { id: 'c', name: 'Collectibles', slug: 'collectibles' },
  seller: { id: SELLER_ID, profile: { displayName: 'Somchai Shop' } },
  ...overrides
});

/**
 * WAT-001 / WAT-002 — following auctions. What an auction looks like is the
 * auction mapper's job and is tested there; this covers what a watched row
 * adds and who is allowed to see it.
 */
describe('WatchlistService', () => {
  let service: WatchlistService;
  let prisma: {
    auction: { findFirst: jest.Mock };
    watchlist: {
      upsert: jest.Mock;
      deleteMany: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
    };
    bid: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      auction: { findFirst: jest.fn().mockResolvedValue({ id: AUCTION_ID }) },
      watchlist: {
        upsert: jest.fn().mockResolvedValue({ createdAt: WATCHED_AT }),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0)
      },
      bid: { findMany: jest.fn().mockResolvedValue([]) }
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        WatchlistService,
        { provide: PrismaService, useValue: prisma }
      ]
    }).compile();

    service = moduleRef.get(WatchlistService);
  });

  /** The watchlist holds these rows. */
  const watching = (...rows: ReturnType<typeof auctionRow>[]) => {
    prisma.watchlist.findMany.mockResolvedValue(
      rows.map((auction) => ({ createdAt: WATCHED_AT, auction }))
    );
    prisma.watchlist.count.mockResolvedValue(rows.length);
  };

  describe('watching an auction (WAT-001)', () => {
    it('records it and says when', async () => {
      const result = await service.watch(AUCTION_ID, USER_ID);

      expect(prisma.watchlist.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId_auctionId: { userId: USER_ID, auctionId: AUCTION_ID }
          }
        })
      );
      expect(result).toEqual({
        auctionId: AUCTION_ID,
        watching: true,
        watchedAt: WATCHED_AT
      });
    });

    // a double tap on a slow connection is not an error
    it('changes nothing when it is already watched', async () => {
      await service.watch(AUCTION_ID, USER_ID);

      const { update } = (
        prisma.watchlist.upsert.mock.calls as {
          update: Record<string, unknown>;
        }[][]
      )[0][0];
      expect(update).toEqual({});
    });

    it('checks the auction is one anybody may see', async () => {
      await service.watch(AUCTION_ID, USER_ID);

      const { where } = (
        prisma.auction.findFirst.mock.calls as {
          where: { status: { in: string[] } };
        }[][]
      )[0][0];
      expect(where.status.in).toEqual([
        'SCHEDULED',
        'ACTIVE',
        'SOLD',
        'UNSOLD'
      ]);
    });

    // saying "you cannot watch it" would confirm a private draft exists
    it('gives nothing away about an auction that is not public', async () => {
      prisma.auction.findFirst.mockResolvedValue(null);

      await expect(service.watch(AUCTION_ID, USER_ID)).rejects.toBeInstanceOf(
        NotFoundException
      );
      expect(prisma.watchlist.upsert).not.toHaveBeenCalled();
    });
  });

  describe('unwatching (WAT-001)', () => {
    it('removes the row and says it did', async () => {
      const result = await service.unwatch(AUCTION_ID, USER_ID);

      expect(prisma.watchlist.deleteMany).toHaveBeenCalledWith({
        where: { userId: USER_ID, auctionId: AUCTION_ID }
      });
      expect(result).toEqual({
        auctionId: AUCTION_ID,
        watching: false,
        removed: true
      });
    });

    // the caller wanted it gone, and it is gone
    it('is not an error when it was never watched', async () => {
      prisma.watchlist.deleteMany.mockResolvedValue({ count: 0 });

      await expect(service.unwatch(AUCTION_ID, USER_ID)).resolves.toMatchObject(
        { watching: false, removed: false }
      );
    });
  });

  describe('the list (WAT-002)', () => {
    it('shows the status, the price and the countdown of each auction', async () => {
      watching(auctionRow());

      const { items } = await service.listOwn(USER_ID, {});

      expect(items[0].auction).toMatchObject({
        status: 'ACTIVE',
        currentPrice: '3500'
      });
      expect(items[0].countdown).toMatchObject({ endsAt: ENDS_AT });
      expect(items[0].watchedAt).toEqual(WATCHED_AT);
    });

    it('measures every countdown on the page against one instant', async () => {
      watching(auctionRow(), auctionRow({ id: OTHER_AUCTION_ID }));

      const { items } = await service.listOwn(USER_ID, {});

      expect(items[0].countdown.serverTime).toEqual(
        items[1].countdown.serverTime
      );
    });

    it('reports nothing as a result while an auction is still running', async () => {
      watching(auctionRow());

      const { items } = await service.listOwn(USER_ID, {});

      expect(items[0].result).toBeNull();
    });

    it('reports how a finished auction ended', async () => {
      watching(
        auctionRow({
          status: 'SOLD',
          soldPrice: dec(5000),
          currentPrice: dec(5000),
          endedAt: ENDS_AT
        })
      );

      const { items } = await service.listOwn(USER_ID, {});

      expect(items[0].result).toMatchObject({
        outcome: 'SOLD',
        soldPrice: '5000',
        finalPrice: '5000'
      });
    });

    // whether you won the thing you were following is the first question this
    // screen has to answer, and a masked name cannot answer it
    it('tells the watcher when they are the one who won', async () => {
      watching(
        auctionRow({ status: 'SOLD', soldPrice: dec(5000), endedAt: ENDS_AT })
      );
      prisma.bid.findMany.mockResolvedValue([
        {
          id: 'bid-1',
          amount: dec(5000),
          sequenceNo: 1,
          placedAt: WATCHED_AT,
          bidderId: USER_ID,
          bidder: { profile: { displayName: 'Somchai' } },
          wonAuction: { id: AUCTION_ID }
        }
      ]);

      const { items } = await service.listOwn(USER_ID, {});

      expect(items[0].result?.winner).toMatchObject({
        bidder: 'S***i',
        isYours: true
      });
    });

    it('tells a watcher who did not win that somebody else did', async () => {
      watching(
        auctionRow({ status: 'SOLD', soldPrice: dec(5000), endedAt: ENDS_AT })
      );
      prisma.bid.findMany.mockResolvedValue([
        {
          id: 'bid-1',
          amount: dec(5000),
          sequenceNo: 1,
          placedAt: WATCHED_AT,
          bidderId: SELLER_ID,
          bidder: { profile: { displayName: 'Somchai' } },
          wonAuction: { id: AUCTION_ID }
        }
      ]);

      const { items } = await service.listOwn(USER_ID, {});

      expect(items[0].result?.winner).toMatchObject({ isYours: false });
      expect(items[0].result?.winner).not.toHaveProperty('bidderId');
    });

    // twenty finished auctions should not cost twenty round trips
    it('loads the winners of the whole page in one query', async () => {
      watching(
        auctionRow({ status: 'SOLD', soldPrice: dec(5000) }),
        auctionRow({ id: OTHER_AUCTION_ID, status: 'SOLD', soldPrice: dec(1) })
      );

      await service.listOwn(USER_ID, {});

      expect(prisma.bid.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.bid.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { wonAuction: { id: { in: [AUCTION_ID, OTHER_AUCTION_ID] } } }
        })
      );
    });

    it('asks for no winners at all when the page is empty', async () => {
      const { items } = await service.listOwn(USER_ID, {});

      expect(items).toEqual([]);
      expect(prisma.bid.findMany).not.toHaveBeenCalled();
    });

    it('scopes the query to the caller, and to auctions anybody may see', async () => {
      await service.listOwn(USER_ID, {});

      const { where } = (
        prisma.watchlist.findMany.mock.calls as {
          where: Record<string, unknown>;
        }[][]
      )[0][0];
      expect(where).toMatchObject({
        userId: USER_ID,
        auction: { deletedAt: null }
      });
    });

    it('pages, most recently watched first', async () => {
      watching(auctionRow());

      const { meta } = await service.listOwn(USER_ID, { page: 2, limit: 5 });

      const args = (
        prisma.watchlist.findMany.mock.calls as {
          orderBy: unknown;
          skip: number;
          take: number;
        }[][]
      )[0][0];
      expect(args.orderBy).toEqual([
        { createdAt: 'desc' },
        { auctionId: 'asc' }
      ]);
      expect(args.skip).toBe(5);
      expect(args.take).toBe(5);
      expect(meta).toMatchObject({ page: 2, limit: 5 });
    });

    // AUC-003 — a watchlist is a buyer's screen
    it('never sends the reserve of somebody else’s auction', async () => {
      watching(auctionRow());

      const { items } = await service.listOwn(USER_ID, {});

      expect(items[0].auction).not.toHaveProperty('reservePrice');
    });

    it('still shows a seller the reserve of their own auction', async () => {
      watching(auctionRow());

      const { items } = await service.listOwn(SELLER_ID, {});

      expect(items[0].auction).toMatchObject({ reservePrice: '4500' });
    });
  });
});
