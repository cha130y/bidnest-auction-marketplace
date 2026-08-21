import { Test } from '@nestjs/testing';
import type { Server, Socket } from 'socket.io';
import { WsException } from '@nestjs/websockets';
import { PrismaService } from '../prisma/prisma.service';
import { AuctionGateway, auctionRoom } from './auction.gateway';

const AUCTION_ID = '00000000-0000-4000-8000-000000000301';
const OTHER_AUCTION_ID = '00000000-0000-4000-8000-000000000302';

/**
 * BID-003 — a bid reaches the room for its own auction and nowhere else, and
 * a client can only ask to join with something that looks like an auction id.
 */
describe('AuctionGateway (BID-003)', () => {
  let gateway: AuctionGateway;
  let client: { join: jest.Mock; leave: jest.Mock };
  let emit: jest.Mock;
  let to: jest.Mock;
  let prisma: { auction: { findFirst: jest.Mock } };

  beforeEach(async () => {
    client = { join: jest.fn(), leave: jest.fn() };
    emit = jest.fn();
    to = jest.fn(() => ({ emit }));
    prisma = { auction: { findFirst: jest.fn() } };
    // the auction exists and is public unless a test says otherwise
    prisma.auction.findFirst.mockResolvedValue({ id: AUCTION_ID });

    const moduleRef = await Test.createTestingModule({
      providers: [AuctionGateway, { provide: PrismaService, useValue: prisma }]
    }).compile();

    gateway = moduleRef.get(AuctionGateway);
    // The decorator assigns this at runtime; tests stand a server in its place.
    (gateway as unknown as { server: Partial<Server> }).server = {
      to
    };
  });

  const asSocket = () => client as unknown as Socket;

  describe('joining and leaving', () => {
    it('puts the client in the room for that auction', async () => {
      const result = await gateway.join(asSocket(), { auctionId: AUCTION_ID });

      expect(client.join).toHaveBeenCalledWith(`auction:${AUCTION_ID}`);
      expect(result).toEqual({ auctionId: AUCTION_ID, joined: true });
    });

    it('takes the client back out again', async () => {
      const result = await gateway.leave(asSocket(), { auctionId: AUCTION_ID });

      expect(client.leave).toHaveBeenCalledWith(`auction:${AUCTION_ID}`);
      expect(result).toEqual({ auctionId: AUCTION_ID, joined: false });
    });

    // the payload comes from a client, so it is checked rather than trusted
    it.each([
      ['nothing at all', undefined],
      ['an empty object', {}],
      ['a non-uuid', { auctionId: 'not-a-uuid' }],
      ['a number', { auctionId: 42 }],
      ['null', { auctionId: null }]
    ])('refuses a join asking with %s', async (_case, payload) => {
      await expect(gateway.join(asSocket(), payload)).rejects.toThrow();
      expect(client.join).not.toHaveBeenCalled();
    });
  });

  /**
   * AUC-005 — the room has to mean the same thing the REST route does, or it
   * becomes a way around it.
   */
  describe('which auctions have a room', () => {
    it('only lets a client into a room for an auction that is public', async () => {
      await gateway.join(asSocket(), { auctionId: AUCTION_ID });

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

    // a DRAFT, a cancelled auction, a deleted one, or an id that never existed
    it('refuses a room for anything the lookup does not return', async () => {
      prisma.auction.findFirst.mockResolvedValue(null);

      await expect(
        gateway.join(asSocket(), { auctionId: AUCTION_ID })
      ).rejects.toThrow(WsException);
      expect(client.join).not.toHaveBeenCalled();
    });

    it('checks nothing on leave — anyone may stop listening', async () => {
      prisma.auction.findFirst.mockResolvedValue(null);

      await expect(
        gateway.leave(asSocket(), { auctionId: AUCTION_ID })
      ).resolves.toEqual({ auctionId: AUCTION_ID, joined: false });
    });
  });

  describe('broadcasting', () => {
    it('sends only to the room of that auction', () => {
      gateway.emitToAuction(AUCTION_ID, 'auction:bid', {
        currentPrice: '3000'
      });

      expect(to).toHaveBeenCalledWith(`auction:${AUCTION_ID}`);
      expect(to).not.toHaveBeenCalledWith(`auction:${OTHER_AUCTION_ID}`);
      expect(emit).toHaveBeenCalledWith('auction:bid', {
        currentPrice: '3000'
      });
    });

    // an auction can run with nobody watching, and a bid must not fail for it
    it('does nothing when no socket server has started', () => {
      const detached = new AuctionGateway(prisma as unknown as PrismaService);

      expect(() =>
        detached.emitToAuction(AUCTION_ID, 'auction:bid', {})
      ).not.toThrow();
    });
  });

  it('names rooms per auction', () => {
    expect(auctionRoom(AUCTION_ID)).toBe(`auction:${AUCTION_ID}`);
    expect(auctionRoom(AUCTION_ID)).not.toBe(auctionRoom(OTHER_AUCTION_ID));
  });
});
