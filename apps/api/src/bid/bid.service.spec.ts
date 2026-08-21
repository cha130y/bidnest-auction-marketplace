import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuctionGateway } from '../realtime/auction.gateway';
import { BidService } from './bid.service';

const AUCTION_ID = '00000000-0000-4000-8000-000000000301';
const SELLER_ID = '00000000-0000-4000-8000-000000000002';
const BIDDER_ID = '00000000-0000-4000-8000-000000000004';
const REQUEST_ID = '00000000-0000-4000-8000-0000000009f1';

/** Shape of a `where` clause a query narrowed itself with. */
type WhereArgs = { where: Record<string, unknown> };

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
  // BID-003 reads the profile to mask a name for the broadcast (BID-005)
  bidder: { profile: { displayName: 'Somchai' } },
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
    auction: {
      findFirst: jest.Mock;
      updateMany: jest.Mock;
      findUniqueOrThrow: jest.Mock;
    };
    bid: {
      findUnique: jest.Mock;
      create: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
    };
    auctionEvent: { create: jest.Mock };
    auctionExtension: { create: jest.Mock };
    $transaction: jest.Mock;
  };
  let gateway: { emitToAuction: jest.Mock };

  /** The auction as it stands after the bid, used to build the broadcast. */
  const auctionAfterBid = (overrides: Record<string, unknown> = {}) => ({
    id: AUCTION_ID,
    currency: 'THB',
    currentPrice: dec(3000),
    reservePrice: dec(4500),
    bidCount: 1,
    currentEndAt: new Date('2026-09-01T12:00:00.000Z'),
    extensionCount: 0,
    ...overrides
  });

  beforeEach(async () => {
    gateway = { emitToAuction: jest.fn() };
    prisma = {
      auction: {
        findFirst: jest.fn(),
        updateMany: jest.fn(),
        findUniqueOrThrow: jest.fn()
      },
      bid: {
        findUnique: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn()
      },
      auctionEvent: { create: jest.fn() },
      auctionExtension: { create: jest.fn() },
      $transaction: jest.fn((run: (tx: unknown) => unknown) => run(prisma))
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        BidService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuctionGateway, useValue: gateway }
      ]
    }).compile();

    service = moduleRef.get(BidService);
  });

  /** Makes listBidHistory return one row built from `overrides`. */
  const historyOf = (overrides: Record<string, unknown> = {}) => {
    prisma.auction.findFirst.mockResolvedValue({ id: AUCTION_ID });
    prisma.bid.findMany.mockResolvedValue([
      {
        id: 'bid-1',
        amount: dec(3000),
        sequenceNo: 1,
        placedAt: new Date('2026-08-21T00:00:00.000Z'),
        bidderId: BIDDER_ID,
        bidder: { profile: { displayName: 'Somchai' } },
        ...overrides
      }
    ]);
    prisma.bid.count.mockResolvedValue(1);
  };

  /** Sets the mocks up so a bid on `auction` will be accepted. */
  const bidWillBeAccepted = (auction = openAuction()) => {
    prisma.bid.findUnique.mockResolvedValue(null);
    prisma.auction.findFirst.mockResolvedValue(auction);
    prisma.auction.updateMany.mockResolvedValue({ count: 1 });
    prisma.bid.create.mockResolvedValue(bidRow());
    prisma.auctionEvent.create.mockResolvedValue({});
    prisma.auction.findUniqueOrThrow.mockResolvedValue(auctionAfterBid());
    prisma.auctionExtension.create.mockResolvedValue({});
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

  /**
   * BID-003 — an accepted bid is announced to the auction's room with the
   * public state and the computed reserve status, and never the reserve.
   */
  describe('the broadcast (BID-003)', () => {
    /** The payload handed to the gateway. */
    const broadcast = () =>
      (
        gateway.emitToAuction.mock.calls as [
          string,
          string,
          Record<string, unknown>
        ][]
      )[0];

    it('announces the bid on the auction room', async () => {
      bidWillBeAccepted();

      await service.placeBid(AUCTION_ID, BIDDER_ID, validDto());

      const [auctionId, event] = broadcast();
      expect(auctionId).toBe(AUCTION_ID);
      expect(event).toBe('auction:bid');
    });

    it('carries the public state after the bid', async () => {
      bidWillBeAccepted();
      prisma.auction.findUniqueOrThrow.mockResolvedValue(
        auctionAfterBid({ currentPrice: dec(5000), bidCount: 3 })
      );

      await service.placeBid(AUCTION_ID, BIDDER_ID, validDto());

      expect(broadcast()[2]).toMatchObject({
        auctionId: AUCTION_ID,
        currency: 'THB',
        currentPrice: '5000',
        bidCount: 3
      });
    });

    it('sends reserveMet, never the reserve itself', async () => {
      bidWillBeAccepted();
      prisma.auction.findUniqueOrThrow.mockResolvedValue(
        auctionAfterBid({ currentPrice: dec(3000), reservePrice: dec(4500) })
      );

      await service.placeBid(AUCTION_ID, BIDDER_ID, validDto());

      const payload = broadcast()[2];
      expect(payload.reserveMet).toBe(false);
      expect(payload).not.toHaveProperty('reservePrice');
      expect(JSON.stringify(payload)).not.toContain('4500');
    });

    it('reports reserveMet true once the price clears the reserve', async () => {
      bidWillBeAccepted();
      prisma.auction.findUniqueOrThrow.mockResolvedValue(
        auctionAfterBid({ currentPrice: dec(5000), reservePrice: dec(4500) })
      );

      await service.placeBid(AUCTION_ID, BIDDER_ID, validDto());

      expect(broadcast()[2].reserveMet).toBe(true);
    });

    /**
     * BID-005 — the bidder appears as the masked label, produced by the same
     * function the history uses, so the two channels can never disagree about
     * how a name is hidden.
     */
    describe('naming the bidder', () => {
      it('sends the masked label, not the name', async () => {
        bidWillBeAccepted();

        await service.placeBid(AUCTION_ID, BIDDER_ID, validDto());

        const payload = broadcast()[2] as { bid: { bidder: string } };
        expect(payload.bid.bidder).toBe('S***i');
        expect(JSON.stringify(payload)).not.toContain('Somchai');
      });

      it('never sends the bidder id', async () => {
        bidWillBeAccepted();

        await service.placeBid(AUCTION_ID, BIDDER_ID, validDto());

        const payload = broadcast()[2] as { bid: Record<string, unknown> };
        expect(payload.bid).not.toHaveProperty('bidderId');
        expect(JSON.stringify(payload)).not.toContain(BIDDER_ID);
      });

      it('copes with a bidder who has no display name', async () => {
        bidWillBeAccepted();
        prisma.bid.create.mockResolvedValue(
          bidRow({ bidder: { profile: { displayName: null } } })
        );

        await service.placeBid(AUCTION_ID, BIDDER_ID, validDto());

        const payload = broadcast()[2] as { bid: { bidder: string } };
        expect(payload.bid.bidder).toBe('***');
      });

      it('copes with a bidder who has no profile at all', async () => {
        bidWillBeAccepted();
        prisma.bid.create.mockResolvedValue(
          bidRow({ bidder: { profile: null } })
        );

        await service.placeBid(AUCTION_ID, BIDDER_ID, validDto());

        const payload = broadcast()[2] as { bid: { bidder: string } };
        expect(payload.bid.bidder).toBe('***');
      });

      // the history and the broadcast have to agree, or a row would change
      // label the moment the page refreshed
      it('masks exactly as the history does', async () => {
        bidWillBeAccepted();

        await service.placeBid(AUCTION_ID, BIDDER_ID, validDto());
        const broadcastLabel = (broadcast()[2] as { bid: { bidder: string } })
          .bid.bidder;

        // set up the history read only now: it reuses auction.findFirst, and
        // pointing that at a bare row earlier would break the bid above
        historyOf();
        const history = await service.listBidHistory(AUCTION_ID, {});

        expect(history.items[0].bidder).toBe(broadcastLabel);
      });
    });

    it('reads the auction back rather than assembling the payload by hand', async () => {
      bidWillBeAccepted();

      await service.placeBid(AUCTION_ID, BIDDER_ID, validDto());

      // BID-004 will change the end time in this same transaction; reading it
      // back is what keeps the broadcast correct without touching this code
      expect(prisma.auction.findUniqueOrThrow).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: AUCTION_ID } })
      );
    });

    describe('stays quiet when there is nothing new to announce', () => {
      it('says nothing when a retry is replayed', async () => {
        prisma.bid.findUnique.mockResolvedValue(bidRow());

        await service.placeBid(AUCTION_ID, BIDDER_ID, validDto());

        expect(gateway.emitToAuction).not.toHaveBeenCalled();
      });

      it('says nothing when the bid was refused', async () => {
        bidWillBeAccepted();

        await expect(
          service.placeBid(AUCTION_ID, BIDDER_ID, validDto({ amount: 1 }))
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(gateway.emitToAuction).not.toHaveBeenCalled();
      });

      it('says nothing when the bid lost the race', async () => {
        prisma.bid.findUnique.mockResolvedValue(null);
        prisma.auction.findFirst.mockResolvedValue(openAuction());
        prisma.auction.updateMany.mockResolvedValue({ count: 0 });

        await expect(
          service.placeBid(AUCTION_ID, BIDDER_ID, validDto())
        ).rejects.toBeInstanceOf(ConflictException);
        expect(gateway.emitToAuction).not.toHaveBeenCalled();
      });
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

  /**
   * BID-004 — a bid in the last two minutes buys everyone else two more, up to
   * five times, and every extension is recorded. The window arithmetic itself
   * is covered in calculate-anti-sniping.util.spec; these tests cover what the
   * service writes and announces around it.
   */
  describe('anti-sniping (BID-004)', () => {
    const minutes = (count: number) => count * 60 * 1000;

    /** An auction that ends in `msFromNow`, with `used` extensions spent. */
    const endingIn = (msFromNow: number, used = 0) =>
      openAuction({
        currentEndAt: new Date(Date.now() + msFromNow),
        extensionCount: used,
        bidCount: 1,
        currentPrice: dec(3000)
      });

    const updateData = () => updateArgs().data;

    const extensionRow = () =>
      (
        prisma.auctionExtension.create.mock.calls as {
          data: Record<string, unknown>;
        }[][]
      )[0][0].data;

    const eventTypes = () =>
      (
        prisma.auctionEvent.create.mock.calls as {
          data: { eventType: string };
        }[][]
      ).map((call) => call[0].data.eventType);

    describe('a bid inside the window', () => {
      it('pushes the end time out', async () => {
        bidWillBeAccepted(endingIn(minutes(1)));

        await service.placeBid(
          AUCTION_ID,
          BIDDER_ID,
          validDto({ amount: 3100 })
        );

        expect(updateData().currentEndAt).toBeInstanceOf(Date);
      });

      it('counts the extension on the auction', async () => {
        bidWillBeAccepted(endingIn(minutes(1)));

        await service.placeBid(
          AUCTION_ID,
          BIDDER_ID,
          validDto({ amount: 3100 })
        );

        expect(updateData().extensionCount).toEqual({ increment: 1 });
      });

      it('records the extension against the bid that caused it', async () => {
        bidWillBeAccepted(endingIn(minutes(1)));

        await service.placeBid(
          AUCTION_ID,
          BIDDER_ID,
          validDto({ amount: 3100 })
        );

        expect(extensionRow()).toMatchObject({
          auctionId: AUCTION_ID,
          triggeredByBidId: 'bid-1',
          extensionNumber: 1
        });
      });

      it('records where the end time moved from and to', async () => {
        const auction = endingIn(minutes(1));
        bidWillBeAccepted(auction);

        await service.placeBid(
          AUCTION_ID,
          BIDDER_ID,
          validDto({ amount: 3100 })
        );

        const row = extensionRow();
        expect(row.previousEndAt).toEqual(auction.currentEndAt);
        expect((row.newEndAt as Date).getTime()).toBe(
          auction.currentEndAt.getTime() + minutes(2)
        );
      });

      it('records an EXTENDED event alongside the BID_PLACED one', async () => {
        bidWillBeAccepted(endingIn(minutes(1)));

        await service.placeBid(
          AUCTION_ID,
          BIDDER_ID,
          validDto({ amount: 3100 })
        );

        expect(eventTypes()).toEqual(['BID_PLACED', 'EXTENDED']);
      });

      it('does it all in the one transaction (BID-002)', async () => {
        bidWillBeAccepted(endingIn(minutes(1)));

        await service.placeBid(
          AUCTION_ID,
          BIDDER_ID,
          validDto({ amount: 3100 })
        );

        expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      });
    });

    describe('a bid outside the window', () => {
      it('leaves the end time alone', async () => {
        bidWillBeAccepted(endingIn(minutes(30)));

        await service.placeBid(
          AUCTION_ID,
          BIDDER_ID,
          validDto({ amount: 3100 })
        );

        expect(updateData().currentEndAt).toBeUndefined();
        expect(updateData().extensionCount).toBeUndefined();
      });

      it('writes no extension row and no EXTENDED event', async () => {
        bidWillBeAccepted(endingIn(minutes(30)));

        await service.placeBid(
          AUCTION_ID,
          BIDDER_ID,
          validDto({ amount: 3100 })
        );

        expect(prisma.auctionExtension.create).not.toHaveBeenCalled();
        expect(eventTypes()).toEqual(['BID_PLACED']);
      });
    });

    describe('once five extensions are spent', () => {
      it('stops moving the end time', async () => {
        bidWillBeAccepted(endingIn(minutes(1), 5));

        await service.placeBid(
          AUCTION_ID,
          BIDDER_ID,
          validDto({ amount: 3100 })
        );

        expect(updateData().currentEndAt).toBeUndefined();
        expect(prisma.auctionExtension.create).not.toHaveBeenCalled();
      });

      // the cap limits extensions, not bidding
      it('still accepts the bid', async () => {
        bidWillBeAccepted(endingIn(minutes(1), 5));

        await expect(
          service.placeBid(AUCTION_ID, BIDDER_ID, validDto({ amount: 3100 }))
        ).resolves.toMatchObject({ id: 'bid-1' });
      });
    });

    describe('what watchers are told', () => {
      /** The auction:extension broadcast, if there was one. */
      const extensionEvent = () =>
        (
          gateway.emitToAuction.mock.calls as [
            string,
            string,
            Record<string, unknown>
          ][]
        ).find((call) => call[1] === 'auction:extension');

      it('announces the extension separately from the bid', async () => {
        bidWillBeAccepted(endingIn(minutes(1)));

        await service.placeBid(
          AUCTION_ID,
          BIDDER_ID,
          validDto({ amount: 3100 })
        );

        const events = (
          gateway.emitToAuction.mock.calls as [string, string, unknown][]
        ).map((call) => call[1]);
        // the price first, then the deadline, in the order they happened
        expect(events).toEqual(['auction:bid', 'auction:extension']);
      });

      it('says how far the deadline moved and how many extensions are left', async () => {
        const auction = endingIn(minutes(1));
        bidWillBeAccepted(auction);

        await service.placeBid(
          AUCTION_ID,
          BIDDER_ID,
          validDto({ amount: 3100 })
        );

        expect(extensionEvent()?.[2]).toMatchObject({
          auctionId: AUCTION_ID,
          extensionNumber: 1,
          previousEndAt: auction.currentEndAt,
          extensionsRemaining: 4
        });
      });

      it('says nothing about extensions when the bid was not late', async () => {
        bidWillBeAccepted(endingIn(minutes(30)));

        await service.placeBid(
          AUCTION_ID,
          BIDDER_ID,
          validDto({ amount: 3100 })
        );

        expect(extensionEvent()).toBeUndefined();
      });

      it('never leaks the reserve in the extension event either', async () => {
        bidWillBeAccepted(endingIn(minutes(1)));

        await service.placeBid(
          AUCTION_ID,
          BIDDER_ID,
          validDto({ amount: 3100 })
        );

        expect(JSON.stringify(extensionEvent()?.[2])).not.toContain('4500');
      });
    });
  });

  /**
   * BID-005 — the public bid history: amount, time, and a masked label for who,
   * oldest first. The masking itself is covered in mask-bidder-name.util.spec.
   */
  describe('listBidHistory (BID-005)', () => {
    const historyRow = (overrides: Record<string, unknown> = {}) => ({
      id: 'bid-1',
      amount: dec(3000),
      sequenceNo: 1,
      placedAt: new Date('2026-08-21T00:00:00.000Z'),
      bidderId: BIDDER_ID,
      bidder: { profile: { displayName: 'Somchai' } },
      ...overrides
    });

    const historyAvailable = (rows: ReturnType<typeof historyRow>[]) => {
      prisma.auction.findFirst.mockResolvedValue({ id: AUCTION_ID });
      prisma.bid.findMany.mockResolvedValue(rows);
      prisma.bid.count.mockResolvedValue(rows.length);
    };

    const findManyArgs = () =>
      (
        prisma.bid.findMany.mock.calls as {
          where: Record<string, unknown>;
          orderBy: unknown;
          skip: number;
          take: number;
        }[][]
      )[0][0];

    it('lists the bids of that auction, oldest first', async () => {
      historyAvailable([historyRow()]);

      await service.listBidHistory(AUCTION_ID, {});

      expect(findManyArgs().where).toEqual({ auctionId: AUCTION_ID });
      // sequenceNo, not placedAt: two bids in the same millisecond still sort
      expect(findManyArgs().orderBy).toEqual({ sequenceNo: 'asc' });
    });

    it('reports the amount and the time', async () => {
      historyAvailable([historyRow()]);

      const result = await service.listBidHistory(AUCTION_ID, {});

      expect(result.items[0]).toMatchObject({
        amount: '3000',
        sequenceNo: 1,
        placedAt: new Date('2026-08-21T00:00:00.000Z')
      });
    });

    describe('privacy', () => {
      it('masks the bidder name', async () => {
        historyAvailable([historyRow()]);

        const result = await service.listBidHistory(AUCTION_ID, {});

        expect(result.items[0].bidder).toBe('S***i');
      });

      it('never sends the bidder id', async () => {
        historyAvailable([historyRow()]);

        const result = await service.listBidHistory(AUCTION_ID, {});

        expect(result.items[0]).not.toHaveProperty('bidderId');
        expect(JSON.stringify(result.items)).not.toContain(BIDDER_ID);
      });

      it('copes with a bidder who has no display name', async () => {
        historyAvailable([
          historyRow({ bidder: { profile: { displayName: null } } })
        ]);

        const result = await service.listBidHistory(AUCTION_ID, {});

        expect(result.items[0].bidder).toBe('***');
      });

      it('copes with a bidder who has no profile at all', async () => {
        historyAvailable([historyRow({ bidder: { profile: null } })]);

        const result = await service.listBidHistory(AUCTION_ID, {});

        expect(result.items[0].bidder).toBe('***');
      });
    });

    describe('telling a viewer which bids are theirs', () => {
      it('marks the viewer own bids', async () => {
        historyAvailable([
          historyRow({ id: 'mine', bidderId: BIDDER_ID }),
          historyRow({ id: 'theirs', bidderId: 'someone-else', sequenceNo: 2 })
        ]);

        const result = await service.listBidHistory(AUCTION_ID, {}, BIDDER_ID);

        expect(result.items.map((bid) => bid.isYours)).toEqual([true, false]);
      });

      // knowing which are yours is not the same as knowing who anyone is
      it('still masks the name of the viewer own bid', async () => {
        historyAvailable([historyRow()]);

        const result = await service.listBidHistory(AUCTION_ID, {}, BIDDER_ID);

        expect(result.items[0]).toMatchObject({
          isYours: true,
          bidder: 'S***i'
        });
      });

      it('marks nothing for a signed-out reader', async () => {
        historyAvailable([historyRow()]);

        const result = await service.listBidHistory(AUCTION_ID, {});

        expect(result.items[0].isYours).toBe(false);
      });
    });

    describe('which auctions have a history', () => {
      it('checks the auction against the public status list', async () => {
        historyAvailable([]);

        await service.listBidHistory(AUCTION_ID, {});

        const where = (
          prisma.auction.findFirst.mock.calls as {
            where: Record<string, unknown>;
          }[][]
        )[0][0].where;
        expect(where).toMatchObject({
          id: AUCTION_ID,
          status: { in: ['SCHEDULED', 'ACTIVE', 'SOLD', 'UNSOLD'] },
          deletedAt: null
        });
      });

      // otherwise the history would be a way to read a draft
      it('refuses an auction the public cannot see', async () => {
        prisma.auction.findFirst.mockResolvedValue(null);

        await expect(
          service.listBidHistory(AUCTION_ID, {})
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(prisma.bid.findMany).not.toHaveBeenCalled();
      });
    });

    describe('paging', () => {
      it('defaults to the first page of twenty', async () => {
        historyAvailable([]);

        await service.listBidHistory(AUCTION_ID, {});

        expect(findManyArgs()).toMatchObject({ skip: 0, take: 20 });
      });

      it('skips whole pages', async () => {
        historyAvailable([]);

        await service.listBidHistory(AUCTION_ID, { page: 3, limit: 10 });

        expect(findManyArgs()).toMatchObject({ skip: 20, take: 10 });
      });

      it('reports the totals', async () => {
        prisma.auction.findFirst.mockResolvedValue({ id: AUCTION_ID });
        prisma.bid.findMany.mockResolvedValue([]);
        prisma.bid.count.mockResolvedValue(45);

        const result = await service.listBidHistory(AUCTION_ID, { limit: 20 });

        expect(result.meta).toEqual({
          page: 1,
          limit: 20,
          total: 45,
          totalPages: 3
        });
      });

      it('counts with the same filter it lists with', async () => {
        historyAvailable([]);

        await service.listBidHistory(AUCTION_ID, {});

        const countArgs = (prisma.bid.count.mock.calls as WhereArgs[][])[0][0];
        expect(countArgs.where).toEqual(findManyArgs().where);
      });

      it('handles an auction with no bids yet', async () => {
        historyAvailable([]);

        const result = await service.listBidHistory(AUCTION_ID, {});

        expect(result.items).toEqual([]);
        expect(result.meta).toMatchObject({ total: 0, totalPages: 0 });
      });
    });
  });
});
