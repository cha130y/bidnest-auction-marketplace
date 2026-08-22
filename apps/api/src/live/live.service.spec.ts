import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuctionService } from '../auction/auction.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuctionGateway } from '../realtime/auction.gateway';
import { LiveService } from './live.service';

const AUCTION_ID = '00000000-0000-4000-8000-0000000005a1';
const VIEWER_ID = '00000000-0000-4000-8000-0000000005b2';

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
  };
  let auctionService: { findPublicAuction: jest.Mock };
  let gateway: { emitToAuction: jest.Mock };

  /** What the REST read hands back, trimmed to what the lobby uses. */
  const publicAuction = {
    id: AUCTION_ID,
    status: 'SCHEDULED',
    scheduledStartAt: STARTS_AT,
    currentEndAt: ENDS_AT
  };

  beforeEach(async () => {
    prisma = {
      auction: { findFirst: jest.fn() },
      auctionParticipant: {
        count: jest.fn().mockResolvedValue(0),
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({ joinedAt: JOINED_AT }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 })
      }
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
      const lobby = await service.getLobby(AUCTION_ID, VIEWER_ID);

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

        const lobby = await service.getLobby(AUCTION_ID, VIEWER_ID);

        expect(lobby.you).toEqual({ joined: true, joinedAt: JOINED_AT });
      });

      it('reports a signed-in viewer who has not joined', async () => {
        const lobby = await service.getLobby(AUCTION_ID, VIEWER_ID);

        expect(lobby.you).toEqual({ joined: false, joinedAt: null });
      });

      // having left is being absent, and an absent person has no arrival time
      it('treats a viewer who left as not here', async () => {
        prisma.auctionParticipant.findUnique.mockResolvedValue({
          status: 'LEFT',
          joinedAt: JOINED_AT
        });

        const lobby = await service.getLobby(AUCTION_ID, VIEWER_ID);

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
