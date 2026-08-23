import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuctionGateway } from '../realtime/auction.gateway';
import { RealtimeService } from '../realtime/realtime.service';
import { AdminAuctionsService } from './auctions.service';

const AUCTION_ID = '00000000-0000-4000-8000-000000000301';
const ADMIN_ID = '00000000-0000-4000-8000-000000000001';
const SELLER_ID = '00000000-0000-4000-8000-000000000002';
const BIDDER_ID = '00000000-0000-4000-8000-000000000004';

const dec = (value: string | number) => new Prisma.Decimal(value);

/** A row shaped exactly like auctionRowSelect returns it. */
const auctionRow = (overrides: Record<string, unknown> = {}) => ({
  id: AUCTION_ID,
  sellerId: SELLER_ID,
  categoryId: '00000000-0000-4000-8000-000000000101',
  title: 'Vintage Seiko 5 Automatic',
  description: 'Serviced last year.',
  condition: 'USED' as const,
  status: 'CANCELLED' as const,
  currency: 'THB',
  startingPrice: dec(3000),
  minBidIncrement: dec(100),
  reservePrice: dec(4500),
  currentPrice: dec(3500),
  bidCount: 2,
  scheduledStartAt: new Date('2026-09-01T10:00:00.000Z'),
  originalEndAt: new Date('2026-09-01T12:00:00.000Z'),
  currentEndAt: new Date('2026-09-01T12:00:00.000Z'),
  publishedAt: null,
  startedAt: null,
  endedAt: new Date('2026-09-01T11:00:00.000Z'),
  extensionCount: 0,
  soldPrice: null,
  cancellationReason: 'Counterfeit listing',
  createdAt: new Date('2026-08-19T00:00:00.000Z'),
  updatedAt: new Date('2026-08-19T00:00:00.000Z'),
  images: [],
  category: { id: 'c', name: 'Collectibles', slug: 'collectibles' },
  seller: { id: SELLER_ID, profile: { displayName: 'Somchai Shop' } },
  ...overrides
});

/**
 * ADM-001 — an admin calls off an auction that should not be running, on the
 * record and with a reason.
 */
describe('AdminAuctionsService (ADM-001)', () => {
  let service: AdminAuctionsService;
  let prisma: {
    auction: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      updateMany: jest.Mock;
      count: jest.Mock;
    };
    auctionEvent: { create: jest.Mock };
    adminAction: { create: jest.Mock };
    notification: { createMany: jest.Mock };
    bid: { findMany: jest.Mock };
    watchlist: { findMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let gateway: { emitToAuction: jest.Mock };
  let realtime: { emitNotificationCreated: jest.Mock };

  beforeEach(async () => {
    prisma = {
      auction: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        findUniqueOrThrow: jest.fn().mockResolvedValue(auctionRow()),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        count: jest.fn().mockResolvedValue(0)
      },
      auctionEvent: { create: jest.fn() },
      adminAction: { create: jest.fn() },
      notification: { createMany: jest.fn() },
      bid: { findMany: jest.fn().mockResolvedValue([]) },
      watchlist: { findMany: jest.fn().mockResolvedValue([]) },
      // Hands the callback the same mock, so assertions can read every call the
      // transaction made without a second layer of fakes.
      $transaction: jest.fn((run: (tx: unknown) => unknown) => run(prisma))
    };
    gateway = { emitToAuction: jest.fn() };
    realtime = { emitNotificationCreated: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminAuctionsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuctionGateway, useValue: gateway },
        { provide: RealtimeService, useValue: realtime }
      ]
    }).compile();

    service = moduleRef.get(AdminAuctionsService);
  });

  /** The auction exists in `status` and the write will land. */
  const cancellable = (status = 'ACTIVE') =>
    prisma.auction.findFirst.mockResolvedValue({
      id: AUCTION_ID,
      status,
      sellerId: SELLER_ID
    });

  const cancel = () =>
    service.cancelAuction(AUCTION_ID, ADMIN_ID, 'Counterfeit listing');

  const updateData = () =>
    (
      prisma.auction.updateMany.mock.calls as {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }[][]
    )[0][0];

  describe('what an admin may cancel', () => {
    // the case this requirement exists for: waiting for an inappropriate
    // auction to finish is not moderation
    it.each(['DRAFT', 'SCHEDULED', 'ACTIVE'])(
      'cancels a %s auction',
      async (status) => {
        cancellable(status);

        await cancel();

        expect(updateData().data.status).toBe('CANCELLED');
      }
    );

    // a sale has a winner and a price behind it; unwinding that is a refund
    it.each(['SOLD', 'UNSOLD', 'CANCELLED'])(
      'refuses one that is already %s',
      async (status) => {
        cancellable(status);

        await expect(cancel()).rejects.toBeInstanceOf(BadRequestException);
        expect(prisma.auction.updateMany).not.toHaveBeenCalled();
      }
    );

    it('answers not-found for an auction that does not exist', async () => {
      prisma.auction.findFirst.mockResolvedValue(null);

      await expect(cancel()).rejects.toBeInstanceOf(NotFoundException);
    });

    // a seller cancelling or an auction settling in the same moment
    it('reports a conflict when the guarded write matches no row', async () => {
      cancellable();
      prisma.auction.updateMany.mockResolvedValue({ count: 0 });

      await expect(cancel()).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.adminAction.create).not.toHaveBeenCalled();
    });

    it('guards the write on the status it read', async () => {
      cancellable('ACTIVE');

      await cancel();

      expect(updateData().where).toMatchObject({
        id: AUCTION_ID,
        status: 'ACTIVE',
        deletedAt: null
      });
    });
  });

  describe('what it records', () => {
    it('stores the reason and stamps when it ended', async () => {
      cancellable();

      await cancel();

      expect(updateData().data).toMatchObject({
        cancellationReason: 'Counterfeit listing'
      });
      expect(updateData().data.endedAt).toBeInstanceOf(Date);
    });

    it('records a CANCELLED event against the admin who did it', async () => {
      cancellable();

      await cancel();

      expect(prisma.auctionEvent.create).toHaveBeenCalledWith({
        data: {
          auctionId: AUCTION_ID,
          actorUserId: ADMIN_ID,
          eventType: 'CANCELLED'
        }
      });
    });

    // ADM-004 — an audit log that can be missing the row for an action that
    // happened is not an audit log
    it('writes the admin action in the same transaction, with the reason', async () => {
      cancellable();

      await cancel();

      expect(prisma.adminAction.create).toHaveBeenCalledWith({
        data: {
          adminUserId: ADMIN_ID,
          auctionId: AUCTION_ID,
          actionType: 'CANCEL_AUCTION',
          note: 'Counterfeit listing'
        }
      });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('who is told (NOT-004)', () => {
    const writtenRows = () =>
      (
        prisma.notification.createMany.mock.calls as {
          data: { userId: string; type: string }[];
        }[][]
      )[0][0].data;

    // unlike their own cancellation, this was not the seller's decision and
    // they are the person most owed an explanation
    it('tells the seller', async () => {
      cancellable();

      await cancel();

      expect(writtenRows()).toContainEqual(
        expect.objectContaining({
          userId: SELLER_ID,
          type: 'AUCTION_CANCELLED'
        })
      );
    });

    it('tells the bidders and the watchers', async () => {
      cancellable();
      prisma.bid.findMany.mockResolvedValue([{ bidderId: BIDDER_ID }]);

      await cancel();

      expect(writtenRows()).toContainEqual(
        expect.objectContaining({ userId: BIDDER_ID })
      );
    });

    it('does not tell the admin who did it', async () => {
      cancellable();
      prisma.watchlist.findMany.mockResolvedValue([{ userId: ADMIN_ID }]);

      await cancel();

      expect(writtenRows().map((row) => row.userId)).not.toContain(ADMIN_ID);
    });

    it('pushes each row to its owner once the transaction commits', async () => {
      cancellable();
      prisma.bid.findMany.mockResolvedValue([{ bidderId: BIDDER_ID }]);

      await cancel();

      expect(realtime.emitNotificationCreated).toHaveBeenCalledTimes(2);
    });
  });

  describe('what the room is told', () => {
    // an admin may cancel an ACTIVE auction, and bidders would otherwise watch
    // a countdown on something that no longer exists
    it('announces the cancellation to the auction room', async () => {
      cancellable();

      await cancel();

      expect(gateway.emitToAuction).toHaveBeenCalledWith(
        AUCTION_ID,
        'auction:cancelled',
        expect.objectContaining({
          auctionId: AUCTION_ID,
          status: 'CANCELLED',
          reason: 'Counterfeit listing'
        })
      );
    });

    // "by an admin" is the seller's business rather than the room's
    it('does not say who cancelled it, or leak the reserve', async () => {
      cancellable();

      await cancel();

      const payload = (
        gateway.emitToAuction.mock.calls as [string, string, unknown][]
      )[0][2];
      expect(JSON.stringify(payload)).not.toContain(ADMIN_ID);
      expect(JSON.stringify(payload)).not.toContain('4500');
    });

    // SRS section 6 — a rollback would bring the auction back
    it('announces nothing when the cancellation failed', async () => {
      cancellable();
      prisma.auction.updateMany.mockResolvedValue({ count: 0 });

      await expect(cancel()).rejects.toBeInstanceOf(BadRequestException);
      expect(gateway.emitToAuction).not.toHaveBeenCalled();
      expect(realtime.emitNotificationCreated).not.toHaveBeenCalled();
    });
  });

  describe('the oversight list', () => {
    it('shows every status, drafts included', async () => {
      await service.listAuctions({});

      const { where } = (
        prisma.auction.findMany.mock.calls as {
          where: Record<string, unknown>;
        }[][]
      )[0][0];
      expect(where).toEqual({ deletedAt: null });
    });

    it('narrows to one status when asked', async () => {
      await service.listAuctions({ status: 'ACTIVE' });

      const { where } = (
        prisma.auction.findMany.mock.calls as {
          where: Record<string, unknown>;
        }[][]
      )[0][0];
      expect(where).toMatchObject({ status: 'ACTIVE' });
    });

    it('pages, newest first', async () => {
      prisma.auction.count.mockResolvedValue(7);

      const { meta } = await service.listAuctions({ page: 2, limit: 5 });

      const args = (
        prisma.auction.findMany.mock.calls as {
          orderBy: unknown;
          skip: number;
          take: number;
        }[][]
      )[0][0];
      expect(args.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'asc' }]);
      expect(args.skip).toBe(5);
      expect(meta).toMatchObject({ page: 2, limit: 5, total: 7 });
    });

    // SRS section 6 forbids disclosing the reserve without carving out admins,
    // and moderating never needs it
    it('never sends the reserve, even to an admin', async () => {
      prisma.auction.findMany.mockResolvedValue([auctionRow()]);
      prisma.auction.count.mockResolvedValue(1);

      const { items } = await service.listAuctions({});

      expect(items[0]).not.toHaveProperty('reservePrice');
      expect(JSON.stringify(items[0])).not.toContain('4500');
    });
  });
});
