import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BidService } from './bid.service';

const AUCTION_ID = '00000000-0000-4000-8000-000000000301';
const SELLER_ID = '00000000-0000-4000-8000-000000000002';
const BIDDER_ID = '00000000-0000-4000-8000-000000000004';
const REQUEST_ID = '00000000-0000-4000-8000-0000000009f1';

const dec = (value: string | number) => new Prisma.Decimal(value);

/** An auction that is running and will accept a bid. */
const openAuction = (overrides: Record<string, unknown> = {}) => ({
  id: AUCTION_ID,
  sellerId: SELLER_ID,
  status: 'ACTIVE',
  startingPrice: dec(3000),
  minBidIncrement: dec(100),
  currentPrice: dec(0),
  bidCount: 0,
  currentEndAt: new Date(Date.now() + 60 * 60 * 1000),
  rowVersion: 7,
  ...overrides
});

const bidRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'bid-1',
  auctionId: AUCTION_ID,
  bidderId: BIDDER_ID,
  amount: dec(3000),
  sequenceNo: 1,
  clientRequestId: REQUEST_ID,
  placedAt: new Date('2026-08-21T00:00:00.000Z'),
  ...overrides
});

const validDto = (overrides: Record<string, unknown> = {}) => ({
  amount: 3000,
  clientRequestId: REQUEST_ID,
  ...overrides
});

describe('BidService (BID-001)', () => {
  let service: BidService;
  let prisma: {
    auction: { findFirst: jest.Mock; updateMany: jest.Mock };
    bid: { findUnique: jest.Mock; create: jest.Mock };
    auctionEvent: { create: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      auction: { findFirst: jest.fn(), updateMany: jest.fn() },
      bid: { findUnique: jest.fn(), create: jest.fn() },
      auctionEvent: { create: jest.fn() },
      $transaction: jest.fn((run: (tx: unknown) => unknown) => run(prisma))
    };

    const moduleRef = await Test.createTestingModule({
      providers: [BidService, { provide: PrismaService, useValue: prisma }]
    }).compile();

    service = moduleRef.get(BidService);
  });

  /** Sets the mocks up so a bid on `auction` will be accepted. */
  const bidWillBeAccepted = (auction = openAuction()) => {
    prisma.bid.findUnique.mockResolvedValue(null);
    prisma.auction.findFirst.mockResolvedValue(auction);
    prisma.auction.updateMany.mockResolvedValue({ count: 1 });
    prisma.bid.create.mockResolvedValue(bidRow());
    prisma.auctionEvent.create.mockResolvedValue({});
  };

  const updateArgs = () =>
    (
      prisma.auction.updateMany.mock.calls as {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }[][]
    )[0][0];

  const createdBid = () =>
    (
      prisma.bid.create.mock.calls as { data: Record<string, unknown> }[][]
    )[0][0].data;

  describe('a bid that is accepted', () => {
    it('records the bid and hands it back', async () => {
      bidWillBeAccepted();

      const result = await service.placeBid(AUCTION_ID, BIDDER_ID, validDto());

      expect(result).toMatchObject({
        auctionId: AUCTION_ID,
        bidderId: BIDDER_ID,
        amount: '3000',
        sequenceNo: 1
      });
    });

    it('moves the current price to the new amount', async () => {
      bidWillBeAccepted();

      await service.placeBid(AUCTION_ID, BIDDER_ID, validDto());

      expect(
        (updateArgs().data.currentPrice as Prisma.Decimal).toString()
      ).toBe('3000');
    });

    it('counts the bid', async () => {
      bidWillBeAccepted();

      await service.placeBid(AUCTION_ID, BIDDER_ID, validDto());

      expect(updateArgs().data.bidCount).toEqual({ increment: 1 });
    });

    it('numbers the bid after the ones already placed', async () => {
      bidWillBeAccepted(openAuction({ bidCount: 4, currentPrice: dec(5000) }));

      await service.placeBid(AUCTION_ID, BIDDER_ID, validDto({ amount: 5100 }));

      expect(createdBid().sequenceNo).toBe(5);
    });

    it('records a BID_PLACED event against the bid', async () => {
      bidWillBeAccepted();

      await service.placeBid(AUCTION_ID, BIDDER_ID, validDto());

      expect(prisma.auctionEvent.create).toHaveBeenCalledWith({
        data: {
          auctionId: AUCTION_ID,
          actorUserId: BIDDER_ID,
          bidId: 'bid-1',
          eventType: 'BID_PLACED'
        }
      });
    });

    it('does the whole thing in one transaction (BID-002)', async () => {
      bidWillBeAccepted();

      await service.placeBid(AUCTION_ID, BIDDER_ID, validDto());

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('the amount', () => {
    it('accepts an opening bid at exactly the starting price', async () => {
      bidWillBeAccepted();

      await expect(
        service.placeBid(AUCTION_ID, BIDDER_ID, validDto({ amount: 3000 }))
      ).resolves.toBeDefined();
    });

    // currentPrice is 0 before the first bid, so the plain formula would allow 100
    it('refuses an opening bid below the starting price', async () => {
      bidWillBeAccepted();

      await expect(
        service.placeBid(AUCTION_ID, BIDDER_ID, validDto({ amount: 2999 }))
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.auction.updateMany).not.toHaveBeenCalled();
    });

    it('refuses a later bid that does not clear the increment', async () => {
      bidWillBeAccepted(openAuction({ bidCount: 1, currentPrice: dec(3000) }));

      await expect(
        service.placeBid(AUCTION_ID, BIDDER_ID, validDto({ amount: 3099 }))
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('accepts a later bid at exactly the increment', async () => {
      bidWillBeAccepted(openAuction({ bidCount: 1, currentPrice: dec(3000) }));

      await expect(
        service.placeBid(AUCTION_ID, BIDDER_ID, validDto({ amount: 3100 }))
      ).resolves.toBeDefined();
    });

    it('says what the minimum actually is', async () => {
      bidWillBeAccepted(openAuction({ bidCount: 1, currentPrice: dec(3000) }));

      await expect(
        service.placeBid(AUCTION_ID, BIDDER_ID, validDto({ amount: 3000 }))
      ).rejects.toThrow(/3100/);
    });
  });

  describe('who may bid', () => {
    it('refuses the seller bidding on their own auction', async () => {
      bidWillBeAccepted();

      await expect(
        service.placeBid(AUCTION_ID, SELLER_ID, validDto())
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.bid.create).not.toHaveBeenCalled();
    });
  });

  describe('which auctions accept bids', () => {
    it('refuses an auction that does not exist', async () => {
      prisma.bid.findUnique.mockResolvedValue(null);
      prisma.auction.findFirst.mockResolvedValue(null);

      await expect(
        service.placeBid(AUCTION_ID, BIDDER_ID, validDto())
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it.each(['DRAFT', 'SCHEDULED', 'SOLD', 'UNSOLD', 'CANCELLED'])(
      'refuses an auction in %s',
      async (status) => {
        bidWillBeAccepted(openAuction({ status }));

        await expect(
          service.placeBid(AUCTION_ID, BIDDER_ID, validDto())
        ).rejects.toBeInstanceOf(ConflictException);
        expect(prisma.bid.create).not.toHaveBeenCalled();
      }
    );

    // the lifecycle pass may not have reached it yet (AUC-007)
    it('refuses an auction whose time is up but is still marked ACTIVE', async () => {
      bidWillBeAccepted(
        openAuction({ currentEndAt: new Date(Date.now() - 1000) })
      );

      await expect(
        service.placeBid(AUCTION_ID, BIDDER_ID, validDto())
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('refuses an auction with no end time at all', async () => {
      bidWillBeAccepted(openAuction({ currentEndAt: null }));

      await expect(
        service.placeBid(AUCTION_ID, BIDDER_ID, validDto())
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  /**
   * BID-002 — a retry is the same bid arriving twice, so it gets the same
   * answer. Only a request id being reused for something else is refused.
   */
  describe('retries and duplicate requests (BID-002)', () => {
    it('replays the original bid instead of failing', async () => {
      prisma.bid.findUnique.mockResolvedValue(bidRow());

      const result = await service.placeBid(AUCTION_ID, BIDDER_ID, validDto());

      expect(result).toMatchObject({ id: 'bid-1', amount: '3000' });
    });

    it('writes nothing at all on a replay', async () => {
      prisma.bid.findUnique.mockResolvedValue(bidRow());

      await service.placeBid(AUCTION_ID, BIDDER_ID, validDto());

      expect(prisma.auction.updateMany).not.toHaveBeenCalled();
      expect(prisma.bid.create).not.toHaveBeenCalled();
      expect(prisma.auctionEvent.create).not.toHaveBeenCalled();
    });

    it('does not even look at the auction on a replay', async () => {
      prisma.bid.findUnique.mockResolvedValue(bidRow());

      await service.placeBid(AUCTION_ID, BIDDER_ID, validDto());

      expect(prisma.auction.findFirst).not.toHaveBeenCalled();
    });

    // reusing an id for a different bid is a caller bug, not a retry
    it('refuses a request id already used on another auction', async () => {
      prisma.bid.findUnique.mockResolvedValue(
        bidRow({ auctionId: 'a-different-auction' })
      );

      await expect(
        service.placeBid(AUCTION_ID, BIDDER_ID, validDto())
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('refuses a request id already used for a different amount', async () => {
      prisma.bid.findUnique.mockResolvedValue(bidRow({ amount: dec(9999) }));

      await expect(
        service.placeBid(AUCTION_ID, BIDDER_ID, validDto())
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('treats the same amount written differently as the same bid', async () => {
      prisma.bid.findUnique.mockResolvedValue(
        bidRow({ amount: dec('3000.00') })
      );

      await expect(
        service.placeBid(AUCTION_ID, BIDDER_ID, validDto({ amount: 3000 }))
      ).resolves.toMatchObject({ id: 'bid-1' });
    });

    it('stores the request id with the bid so the next retry is caught', async () => {
      bidWillBeAccepted();

      await service.placeBid(AUCTION_ID, BIDDER_ID, validDto());

      expect(createdBid().clientRequestId).toBe(REQUEST_ID);
    });

    describe('when two copies of a retry race each other', () => {
      /** Prisma's answer when the unique index rejects the second insert. */
      const uniqueViolation = () =>
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
          meta: { target: ['client_request_id'] }
        });

      it('replays the bid that won rather than surfacing the violation', async () => {
        prisma.bid.findUnique
          // inside the transaction: not there yet
          .mockResolvedValueOnce(null)
          // after the violation: the winner has committed
          .mockResolvedValueOnce(bidRow());
        prisma.auction.findFirst.mockResolvedValue(openAuction());
        prisma.auction.updateMany.mockResolvedValue({ count: 1 });
        prisma.bid.create.mockRejectedValue(uniqueViolation());

        const result = await service.placeBid(
          AUCTION_ID,
          BIDDER_ID,
          validDto()
        );

        expect(result).toMatchObject({ id: 'bid-1', amount: '3000' });
      });

      it('still refuses if the winning bid was for something else', async () => {
        prisma.bid.findUnique
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(bidRow({ amount: dec(9999) }));
        prisma.auction.findFirst.mockResolvedValue(openAuction());
        prisma.auction.updateMany.mockResolvedValue({ count: 1 });
        prisma.bid.create.mockRejectedValue(uniqueViolation());

        await expect(
          service.placeBid(AUCTION_ID, BIDDER_ID, validDto())
        ).rejects.toBeInstanceOf(ConflictException);
      });

      it('lets an unrelated unique violation through untouched', async () => {
        const otherViolation = new Prisma.PrismaClientKnownRequestError(
          'Unique constraint failed',
          {
            code: 'P2002',
            clientVersion: 'test',
            meta: { target: ['auction_id', 'sequence_no'] }
          }
        );
        prisma.bid.findUnique.mockResolvedValue(null);
        prisma.auction.findFirst.mockResolvedValue(openAuction());
        prisma.auction.updateMany.mockResolvedValue({ count: 1 });
        prisma.bid.create.mockRejectedValue(otherViolation);

        await expect(
          service.placeBid(AUCTION_ID, BIDDER_ID, validDto())
        ).rejects.toBe(otherViolation);
      });
    });
  });

  describe('two bidders arriving at once', () => {
    it('guards the write on the exact row version it read', async () => {
      bidWillBeAccepted(openAuction({ rowVersion: 42 }));

      await service.placeBid(AUCTION_ID, BIDDER_ID, validDto());

      expect(updateArgs().where).toMatchObject({
        id: AUCTION_ID,
        status: 'ACTIVE',
        deletedAt: null,
        rowVersion: 42
      });
    });

    it('refuses the bid that lost the race, writing nothing', async () => {
      // nothing under this request id, so losing means somebody else bid
      prisma.bid.findUnique.mockResolvedValue(null);
      prisma.auction.findFirst.mockResolvedValue(openAuction());
      prisma.auction.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.placeBid(AUCTION_ID, BIDDER_ID, validDto())
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.bid.create).not.toHaveBeenCalled();
      expect(prisma.auctionEvent.create).not.toHaveBeenCalled();
    });

    /**
     * BID-002 — the rowVersion guard fires before the unique index ever can,
     * so two copies of one retry racing each other land here rather than on a
     * constraint violation. Losing the race is not the same as being refused.
     */
    it('replays instead of refusing when the winner was this same retry', async () => {
      prisma.bid.findUnique
        // inside the transaction, before the update: nothing yet
        .mockResolvedValueOnce(null)
        // after losing the race: the winner has committed and is readable
        .mockResolvedValueOnce(bidRow());
      prisma.auction.findFirst.mockResolvedValue(openAuction());
      prisma.auction.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.placeBid(AUCTION_ID, BIDDER_ID, validDto());

      expect(result).toMatchObject({ id: 'bid-1', amount: '3000' });
      expect(prisma.bid.create).not.toHaveBeenCalled();
    });

    it('still refuses when the winner was a different bid entirely', async () => {
      prisma.bid.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(bidRow({ amount: dec(9999) }));
      prisma.auction.findFirst.mockResolvedValue(openAuction());
      prisma.auction.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.placeBid(AUCTION_ID, BIDDER_ID, validDto())
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
