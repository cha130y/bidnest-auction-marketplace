import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { AuctionLifecycleService } from './auction-lifecycle.service';
import { AuctionService } from './auction.service';

const AUCTION_A = '00000000-0000-4000-8000-0000000004a1';
const AUCTION_B = '00000000-0000-4000-8000-0000000004b2';

/**
 * AUC-005 / AUC-007 — the two clock-driven transitions. The settlement rules
 * themselves live in AuctionService and are tested there; this covers the pass
 * that finds the work and the guards around running it.
 */
describe('AuctionLifecycleService', () => {
  let service: AuctionLifecycleService;
  let prisma: {
    auction: { findMany: jest.Mock; updateMany: jest.Mock };
    auctionEvent: { create: jest.Mock };
    $transaction: jest.Mock;
  };
  let auctionService: { settleAuction: jest.Mock };

  beforeEach(async () => {
    // One test deliberately makes a pass throw; the service is meant to log it
    // and carry on, and that log would otherwise print a stack trace mid-run.
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

    prisma = {
      auction: { findMany: jest.fn(), updateMany: jest.fn() },
      auctionEvent: { create: jest.fn() },
      $transaction: jest.fn((run: (tx: unknown) => unknown) => run(prisma))
    };
    auctionService = { settleAuction: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuctionLifecycleService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuctionService, useValue: auctionService }
      ]
    }).compile();

    service = moduleRef.get(AuctionLifecycleService);
  });

  /** No auctions due on either half of the pass. */
  const nothingDue = () => prisma.auction.findMany.mockResolvedValue([]);

  /** `due` are ready to start, `expired` are ready to settle. */
  const workWaiting = (due: string[], expired: string[]) => {
    prisma.auction.findMany
      .mockResolvedValueOnce(due.map((id) => ({ id })))
      .mockResolvedValueOnce(expired.map((id) => ({ id })));
  };

  const startArgs = () =>
    (
      prisma.auction.updateMany.mock.calls as {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }[][]
    )[0][0];

  describe('starting scheduled auctions (AUC-005)', () => {
    it('opens a scheduled auction whose start time has arrived', async () => {
      workWaiting([AUCTION_A], []);
      prisma.auction.updateMany.mockResolvedValue({ count: 1 });

      await service.reconcileLifecycle();

      const { data } = startArgs();
      expect(data.status).toBe('ACTIVE');
      expect(data.startedAt).toBeInstanceOf(Date);
    });

    it('guards the write on SCHEDULED so a cancellation in the same moment wins cleanly', async () => {
      workWaiting([AUCTION_A], []);
      prisma.auction.updateMany.mockResolvedValue({ count: 1 });

      await service.reconcileLifecycle();

      expect(startArgs().where).toMatchObject({
        id: AUCTION_A,
        status: 'SCHEDULED',
        deletedAt: null
      });
    });

    it('records a STARTED event', async () => {
      workWaiting([AUCTION_A], []);
      prisma.auction.updateMany.mockResolvedValue({ count: 1 });

      await service.reconcileLifecycle();

      expect(prisma.auctionEvent.create).toHaveBeenCalledWith({
        data: { auctionId: AUCTION_A, eventType: 'STARTED' }
      });
    });

    it('writes no event when the guarded update matched nothing', async () => {
      workWaiting([AUCTION_A], []);
      prisma.auction.updateMany.mockResolvedValue({ count: 0 });

      await service.reconcileLifecycle();

      expect(prisma.auctionEvent.create).not.toHaveBeenCalled();
    });

    it('only looks at auctions that already have an end time', async () => {
      nothingDue();

      await service.reconcileLifecycle();

      const where = (
        prisma.auction.findMany.mock.calls as {
          where: Record<string, unknown>;
          take: number;
        }[][]
      )[0][0].where;
      expect(where).toMatchObject({
        status: 'SCHEDULED',
        currentEndAt: { not: null },
        deletedAt: null
      });
    });
  });

  describe('settling expired auctions (AUC-007)', () => {
    it('hands each expired auction to the same settle logic a read uses', async () => {
      workWaiting([], [AUCTION_A, AUCTION_B]);
      auctionService.settleAuction.mockResolvedValue({ sold: true });

      await service.reconcileLifecycle();

      expect(auctionService.settleAuction).toHaveBeenCalledWith(AUCTION_A);
      expect(auctionService.settleAuction).toHaveBeenCalledWith(AUCTION_B);
    });

    it('does not count an auction somebody else settled first', async () => {
      workWaiting([], [AUCTION_A, AUCTION_B]);
      auctionService.settleAuction
        .mockResolvedValueOnce({ sold: true })
        .mockResolvedValueOnce(null);

      await service.reconcileLifecycle();

      // both were attempted, only one was actually settled here
      expect(auctionService.settleAuction).toHaveBeenCalledTimes(2);
    });

    it('looks only at ACTIVE auctions that are past their end time', async () => {
      nothingDue();

      await service.reconcileLifecycle();

      const where = (
        prisma.auction.findMany.mock.calls as {
          where: Record<string, unknown>;
        }[][]
      )[1][0].where;
      expect(where).toMatchObject({ status: 'ACTIVE', deletedAt: null });
      expect(where.currentEndAt).toHaveProperty('lte');
    });
  });

  describe('the pass itself', () => {
    it('does nothing when no auction is due', async () => {
      nothingDue();

      await service.reconcileLifecycle();

      expect(prisma.auction.updateMany).not.toHaveBeenCalled();
      expect(auctionService.settleAuction).not.toHaveBeenCalled();
    });

    it('caps how many auctions one pass may touch', async () => {
      nothingDue();

      await service.reconcileLifecycle();

      const calls = prisma.auction.findMany.mock.calls as { take: number }[][];
      expect(calls[0][0].take).toBe(50);
      expect(calls[1][0].take).toBe(50);
    });

    // A slow pass must not overlap the next tick
    it('skips a tick while the previous pass is still running', async () => {
      let releaseFirstPass: () => void = () => undefined;
      prisma.auction.findMany.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            releaseFirstPass = () => resolve([]);
          })
      );

      const firstPass = service.reconcileLifecycle();
      await service.reconcileLifecycle(); // fires while the first is in flight

      expect(prisma.auction.findMany).toHaveBeenCalledTimes(1);

      prisma.auction.findMany.mockResolvedValue([]);
      releaseFirstPass();
      await firstPass;
    });

    it('runs again after a pass that threw', async () => {
      prisma.auction.findMany.mockRejectedValueOnce(new Error('database down'));

      // the failure is swallowed and logged, not rethrown
      await expect(service.reconcileLifecycle()).resolves.toBeUndefined();

      nothingDue();
      await service.reconcileLifecycle();
      expect(prisma.auction.findMany).toHaveBeenCalledTimes(3);
    });
  });
});
