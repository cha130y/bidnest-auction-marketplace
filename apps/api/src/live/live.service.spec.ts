import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuctionService } from '../auction/auction.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuctionGateway } from '../realtime/auction.gateway';
import { LiveService } from './live.service';

const AUCTION_ID = '00000000-0000-4000-8000-0000000005a1';
const VIEWER_ID = '00000000-0000-4000-8000-0000000005b2';
const SELLER_ID = '00000000-0000-4000-8000-0000000005c3';

/** The signed-in person looking, as the guard hands them to the service. */
const VIEWER = {
  id: VIEWER_ID,
  email: 'viewer@example.com',
  role: 'USER',
  status: 'ACTIVE'
} as const;

const STARTS_AT = new Date('2026-09-01T10:00:00.000Z');
const ENDS_AT = new Date('2026-09-01T12:00:00.000Z');
const JOINED_AT = new Date('2026-09-01T09:30:00.000Z');

/**
 * LIV-001 — the lobby read and taking part in an auction. What the auction
 * itself looks like is AuctionService's job and is tested there; this covers
 * what the lobby adds on top of it.
 */
describe('LiveService', () => {
  let service: LiveService;
  let prisma: {
    auction: { findFirst: jest.Mock };
    auctionParticipant: {
      count: jest.Mock;
      findUnique: jest.Mock;
      upsert: jest.Mock;
      updateMany: jest.Mock;
    };
    bid: { findFirst: jest.Mock; findMany: jest.Mock };
    auctionExtension: { findFirst: jest.Mock };
  };
  let auctionService: { findPublicAuction: jest.Mock };
  let gateway: { emitToAuction: jest.Mock };

  /** What the REST read hands back, trimmed to what the live routes use. */
  const publicAuction = {
    id: AUCTION_ID,
    status: 'ACTIVE',
    biddingOpen: true,
    seller: { id: SELLER_ID },
    scheduledStartAt: STARTS_AT,
    currentEndAt: ENDS_AT,
    extensionCount: 0
  };

  /** A bid row as bidHistorySelect loads it. */
  const bidRow = (
    amount: string,
    sequenceNo: number,
    bidderId = VIEWER_ID
  ) => ({
    id: `bid-${sequenceNo}`,
    amount: { toString: () => amount },
    sequenceNo,
    placedAt: JOINED_AT,
    bidderId,
    bidder: { profile: { displayName: 'Somchai' } }
  });

  beforeEach(async () => {
    prisma = {
      auction: { findFirst: jest.fn() },
      auctionParticipant: {
        count: jest.fn().mockResolvedValue(0),
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({ joinedAt: JOINED_AT }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 })
      },
      bid: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([])
      },
      auctionExtension: { findFirst: jest.fn().mockResolvedValue(null) }
    };
    auctionService = {
      findPublicAuction: jest.fn().mockResolvedValue(publicAuction)
    };
    gateway = { emitToAuction: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        LiveService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuctionService, useValue: auctionService },
        { provide: AuctionGateway, useValue: gateway }
      ]
    }).compile();

    service = moduleRef.get(LiveService);
  });

  /** The auction exists and is still open to join. */
  const joinable = (status = 'SCHEDULED') =>
    prisma.auction.findFirst.mockResolvedValue({ status });

  /** The payload of the last presence broadcast. */
  const lastPresence = () => {
    const calls = gateway.emitToAuction.mock.calls as [
      string,
      string,
      { participantCount: number; at: Date }
    ][];
    return calls[calls.length - 1];
  };

  describe('the lobby read (LIV-001)', () => {
    it('returns the auction through the same read the REST route uses', async () => {
      const lobby = await service.getLobby(AUCTION_ID, VIEWER);

      expect(auctionService.findPublicAuction).toHaveBeenCalledWith(
        AUCTION_ID,
        VIEWER_ID
      );
      expect(lobby.auction).toBe(publicAuction);
    });

    it('counts only the people who are currently here', async () => {
      prisma.auctionParticipant.count.mockResolvedValue(7);

      const lobby = await service.getLobby(AUCTION_ID);

      expect(prisma.auctionParticipant.count).toHaveBeenCalledWith({
        where: { auctionId: AUCTION_ID, status: 'JOINED' }
      });
      expect(lobby.participantCount).toBe(7);
    });

    it('counts down to the start and the end of the auction', async () => {
      const lobby = await service.getLobby(AUCTION_ID);

      expect(lobby.countdown).toMatchObject({
        startsAt: STARTS_AT,
        endsAt: ENDS_AT
      });
      expect(lobby.countdown.serverTime).toBeInstanceOf(Date);
    });

    describe('the state of the person looking', () => {
      it('says nothing about a visitor who is not signed in', async () => {
        const lobby = await service.getLobby(AUCTION_ID);

        expect(lobby.you).toBeNull();
        expect(prisma.auctionParticipant.findUnique).not.toHaveBeenCalled();
      });

      it('reports a signed-in viewer who has joined, and since when', async () => {
        prisma.auctionParticipant.findUnique.mockResolvedValue({
          status: 'JOINED',
          joinedAt: JOINED_AT
        });

        const lobby = await service.getLobby(AUCTION_ID, VIEWER);

        expect(lobby.you).toEqual({ joined: true, joinedAt: JOINED_AT });
      });

      it('reports a signed-in viewer who has not joined', async () => {
        const lobby = await service.getLobby(AUCTION_ID, VIEWER);

        expect(lobby.you).toEqual({ joined: false, joinedAt: null });
      });

      // having left is being absent, and an absent person has no arrival time
      it('treats a viewer who left as not here', async () => {
        prisma.auctionParticipant.findUnique.mockResolvedValue({
          status: 'LEFT',
          joinedAt: JOINED_AT
        });

        const lobby = await service.getLobby(AUCTION_ID, VIEWER);

        expect(lobby.you).toEqual({ joined: false, joinedAt: null });
      });
    });

    it('hides a lobby the auction read hides', async () => {
      auctionService.findPublicAuction.mockRejectedValue(
        new NotFoundException('Auction not found')
      );

      await expect(service.getLobby(AUCTION_ID)).rejects.toBeInstanceOf(
        NotFoundException
      );
    });
  });

  describe('the arena read (LIV-002)', () => {
    /** The bidding so far, newest first. */
    const bidding = (...bids: ReturnType<typeof bidRow>[]) => {
      prisma.bid.findFirst.mockResolvedValue(bids[0] ?? null);
      prisma.bid.findMany.mockResolvedValue(bids);
    };

    it('carries everything the lobby does', async () => {
      prisma.auctionParticipant.count.mockResolvedValue(4);

      const arena = await service.getArena(AUCTION_ID);

      expect(arena.auction).toBe(publicAuction);
      expect(arena.participantCount).toBe(4);
      expect(arena.countdown).toMatchObject({ endsAt: ENDS_AT });
    });

    it('names the leader, masked', async () => {
      bidding(bidRow('3100', 7));

      const arena = await service.getArena(AUCTION_ID);

      expect(arena.leader).toMatchObject({
        amount: '3100',
        sequenceNo: 7,
        bidder: 'S***i'
      });
    });

    // AUC-007 settles by the same order, so the person leading is the person
    // who would win
    it('picks the leader by amount, breaking a tie on who got there first', async () => {
      bidding(bidRow('3100', 7));

      await service.getArena(AUCTION_ID);

      const { orderBy } = (
        prisma.bid.findFirst.mock.calls as { orderBy: unknown }[][]
      )[0][0];
      expect(orderBy).toEqual([{ amount: 'desc' }, { sequenceNo: 'asc' }]);
    });

    it('never sends a bidder id, only a mask and whether it is yours', async () => {
      bidding(bidRow('3100', 7, VIEWER_ID));

      const arena = await service.getArena(AUCTION_ID, VIEWER);

      expect(arena.leader).not.toHaveProperty('bidderId');
      expect(arena.leader).toMatchObject({ isYours: true });
    });

    it('has no leader before anybody has bid', async () => {
      const arena = await service.getArena(AUCTION_ID);

      expect(arena.leader).toBeNull();
      expect(arena.recentBids).toEqual([]);
    });

    it('lists the latest bids newest first, capped', async () => {
      bidding(bidRow('3100', 7), bidRow('3000', 6));

      const arena = await service.getArena(AUCTION_ID);

      const { orderBy, take } = (
        prisma.bid.findMany.mock.calls as { orderBy: unknown; take: number }[][]
      )[0][0];
      expect(orderBy).toEqual({ sequenceNo: 'desc' });
      expect(take).toBe(10);
      expect(arena.recentBids.map((bid) => bid.sequenceNo)).toEqual([7, 6]);
    });

    // LIV-003 — the urgent state, so a screen does not have to know BID-004's
    // rule to know when to look urgent
    describe('sudden death (LIV-003)', () => {
      /** An auction whose deadline is `ms` away from real now. */
      const endingIn = (ms: number, extensionCount = 0) =>
        auctionService.findPublicAuction.mockResolvedValue({
          ...publicAuction,
          currentEndAt: new Date(Date.now() + ms),
          extensionCount
        });

      it('is quiet while there is plenty of time left', async () => {
        const arena = await service.getArena(AUCTION_ID);

        expect(arena.suddenDeath).toMatchObject({
          active: false,
          extensionCount: 0,
          extensionsRemaining: 5,
          lastExtension: null
        });
      });

      it('turns on inside the last two minutes', async () => {
        endingIn(60_000);

        const arena = await service.getArena(AUCTION_ID);

        expect(arena.suddenDeath.active).toBe(true);
      });

      it('counts the extensions used and the ones left', async () => {
        endingIn(60_000, 3);

        const arena = await service.getArena(AUCTION_ID);

        expect(arena.suddenDeath).toMatchObject({
          extensionCount: 3,
          extensionsRemaining: 2
        });
      });

      it('shows the deadline move a reader may have missed', async () => {
        const moved = {
          extensionNumber: 2,
          previousEndAt: STARTS_AT,
          newEndAt: ENDS_AT
        };
        prisma.auctionExtension.findFirst.mockResolvedValue(moved);

        const arena = await service.getArena(AUCTION_ID);

        expect(arena.suddenDeath.lastExtension).toEqual(moved);
      });

      it('reads the most recent extension, not the first', async () => {
        await service.getArena(AUCTION_ID);

        const { orderBy } = (
          prisma.auctionExtension.findFirst.mock.calls as {
            orderBy: unknown;
          }[][]
        )[0][0];
        expect(orderBy).toEqual({ extensionNumber: 'desc' });
      });

      // the urgency and the clock on screen must describe the same instant
      it('is measured against the same moment the countdown is', async () => {
        endingIn(60_000);

        const arena = await service.getArena(AUCTION_ID);

        expect(arena.countdown.msUntilEnd).toBeLessThanOrEqual(
          arena.suddenDeath.windowMs
        );
        expect(arena.suddenDeath.active).toBe(true);
      });
    });

    // LIV-004 — the result panel's data, on the same read the arena uses
    describe('the result (LIV-004)', () => {
      /** The auction as it looks once settlement has run. */
      const settled = (status: 'SOLD' | 'UNSOLD', soldPrice: string | null) =>
        auctionService.findPublicAuction.mockResolvedValue({
          ...publicAuction,
          status,
          biddingOpen: false,
          soldPrice,
          currentPrice: '5000',
          bidCount: 3,
          reserveMet: status === 'SOLD',
          endedAt: ENDS_AT
        });

      it('reports nothing while the auction is still running', async () => {
        const arena = await service.getArena(AUCTION_ID);

        expect(arena.result).toBeNull();
      });

      it('reports a sale with its price and winner', async () => {
        settled('SOLD', '5000');
        prisma.bid.findFirst.mockResolvedValue(bidRow('5000', 3));

        const arena = await service.getArena(AUCTION_ID, VIEWER);

        expect(arena.result).toMatchObject({
          outcome: 'SOLD',
          soldPrice: '5000',
          finalPrice: '5000',
          endedAt: ENDS_AT
        });
        expect(arena.result?.winner).toMatchObject({
          bidder: 'S***i',
          isYours: true
        });
      });

      it('reports an auction that did not sell', async () => {
        settled('UNSOLD', null);

        const arena = await service.getArena(AUCTION_ID);

        expect(arena.result).toMatchObject({
          outcome: 'UNSOLD',
          soldPrice: null,
          finalPrice: '5000',
          winner: null
        });
      });

      // the recorded winner, not one recomputed from the bids
      it('reads the winner through the auction it was recorded against', async () => {
        settled('SOLD', '5000');

        await service.getArena(AUCTION_ID);

        const calls = prisma.bid.findFirst.mock.calls as {
          where: Record<string, unknown>;
        }[][];
        expect(calls[1][0].where).toEqual({ wonAuction: { id: AUCTION_ID } });
      });
    });

    describe('whether the person looking may bid', () => {
      it('says nothing at all to a visitor who is not signed in', async () => {
        const arena = await service.getArena(AUCTION_ID);

        expect(arena.you).toBeNull();
      });

      it('tells a signed-in user they may bid on a running auction', async () => {
        const arena = await service.getArena(AUCTION_ID, VIEWER);

        expect(arena.you).toMatchObject({ canBid: true, blockedBy: null });
      });

      it('tells the seller why they may not', async () => {
        const arena = await service.getArena(AUCTION_ID, {
          ...VIEWER,
          id: SELLER_ID
        });

        expect(arena.you).toMatchObject({
          canBid: false,
          blockedBy: 'YOU_ARE_THE_SELLER'
        });
      });

      it('keeps the joined state the lobby reports', async () => {
        prisma.auctionParticipant.findUnique.mockResolvedValue({
          status: 'JOINED',
          joinedAt: JOINED_AT
        });

        const arena = await service.getArena(AUCTION_ID, VIEWER);

        expect(arena.you).toMatchObject({ joined: true, joinedAt: JOINED_AT });
      });
    });
  });

  describe('joining (LIV-001)', () => {
    it('records the person as present and reports the new count', async () => {
      joinable();
      prisma.auctionParticipant.count.mockResolvedValue(3);

      const result = await service.join(AUCTION_ID, VIEWER_ID);

      expect(prisma.auctionParticipant.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            auctionId_userId: { auctionId: AUCTION_ID, userId: VIEWER_ID }
          }
        })
      );
      expect(result).toMatchObject({
        auctionId: AUCTION_ID,
        joined: true,
        joinedAt: JOINED_AT,
        participantCount: 3
      });
    });

    it('pushes the new count to the room instead of waiting to be asked', async () => {
      joinable();
      prisma.auctionParticipant.count.mockResolvedValue(3);

      await service.join(AUCTION_ID, VIEWER_ID);

      const [auctionId, event, payload] = lastPresence();
      expect(auctionId).toBe(AUCTION_ID);
      expect(event).toBe('auction:presence');
      expect(payload).toMatchObject({
        auctionId: AUCTION_ID,
        participantCount: 3
      });
      expect(payload.at).toBeInstanceOf(Date);
    });

    // a client that reconnects and rejoins must not make the number jump
    it('announces nothing when the person was already here', async () => {
      joinable();
      prisma.auctionParticipant.findUnique.mockResolvedValue({
        status: 'JOINED',
        joinedAt: JOINED_AT
      });

      const result = await service.join(AUCTION_ID, VIEWER_ID);

      expect(result.joined).toBe(true);
      expect(gateway.emitToAuction).not.toHaveBeenCalled();
    });

    it('announces a return after leaving', async () => {
      joinable();
      prisma.auctionParticipant.findUnique.mockResolvedValue({
        status: 'LEFT',
        joinedAt: JOINED_AT
      });

      await service.join(AUCTION_ID, VIEWER_ID);

      expect(gateway.emitToAuction).toHaveBeenCalled();
    });

    // the first arrival is when they first came, not when they came back
    it('leaves the original arrival time alone on a rejoin', async () => {
      joinable();

      await service.join(AUCTION_ID, VIEWER_ID);

      const { update } = (
        prisma.auctionParticipant.upsert.mock.calls as {
          update: Record<string, unknown>;
        }[][]
      )[0][0];
      expect(update).not.toHaveProperty('joinedAt');
    });

    it('opens an auction that is already running', async () => {
      joinable('ACTIVE');

      await expect(service.join(AUCTION_ID, VIEWER_ID)).resolves.toMatchObject({
        joined: true
      });
    });

    it('refuses an auction that has finished', async () => {
      joinable('SOLD');

      await expect(service.join(AUCTION_ID, VIEWER_ID)).rejects.toBeInstanceOf(
        ConflictException
      );
      expect(prisma.auctionParticipant.upsert).not.toHaveBeenCalled();
    });

    // saying "you cannot join it" would confirm a private draft exists
    it('gives nothing away about an auction that is not public', async () => {
      prisma.auction.findFirst.mockResolvedValue(null);

      await expect(service.join(AUCTION_ID, VIEWER_ID)).rejects.toBeInstanceOf(
        NotFoundException
      );
    });
  });

  describe('leaving (LIV-001)', () => {
    it('marks the person as gone and reports the new count', async () => {
      prisma.auctionParticipant.updateMany.mockResolvedValue({ count: 1 });
      prisma.auctionParticipant.count.mockResolvedValue(2);

      const result = await service.leave(AUCTION_ID, VIEWER_ID);

      expect(prisma.auctionParticipant.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            auctionId: AUCTION_ID,
            userId: VIEWER_ID,
            status: 'JOINED'
          }
        })
      );
      expect(result).toEqual({
        auctionId: AUCTION_ID,
        joined: false,
        participantCount: 2
      });
    });

    it('keeps the row as LEFT rather than deleting it', async () => {
      prisma.auctionParticipant.updateMany.mockResolvedValue({ count: 1 });

      await service.leave(AUCTION_ID, VIEWER_ID);

      const { data } = (
        prisma.auctionParticipant.updateMany.mock.calls as {
          data: Record<string, unknown>;
        }[][]
      )[0][0];
      expect(data.status).toBe('LEFT');
    });

    it('pushes the new count to the room', async () => {
      prisma.auctionParticipant.updateMany.mockResolvedValue({ count: 1 });
      prisma.auctionParticipant.count.mockResolvedValue(2);

      await service.leave(AUCTION_ID, VIEWER_ID);

      const [, event, payload] = lastPresence();
      expect(event).toBe('auction:presence');
      expect(payload.participantCount).toBe(2);
    });

    // a number that did not move is not news
    it('announces nothing when the person was not here', async () => {
      prisma.auctionParticipant.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.leave(AUCTION_ID, VIEWER_ID);

      expect(result.joined).toBe(false);
      expect(gateway.emitToAuction).not.toHaveBeenCalled();
    });
  });
});
