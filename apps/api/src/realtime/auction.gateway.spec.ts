import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server, Socket } from 'socket.io';
import { WsException } from '@nestjs/websockets';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { EnvVariable } from '../config/env.validation';
import { AuctionGateway, auctionRoom } from './auction.gateway';
import { PresenceRegistry } from './presence-registry';

const AUCTION_ID = '00000000-0000-4000-8000-000000000301';
const OTHER_AUCTION_ID = '00000000-0000-4000-8000-000000000302';
const USER_ID = '00000000-0000-4000-8000-000000000801';

/**
 * BID-003 — a bid reaches the room for its own auction and nowhere else, and
 * a client can only ask to join with something that looks like an auction id.
 */
describe('AuctionGateway (BID-003)', () => {
  let gateway: AuctionGateway;
  let client: { id: string; join: jest.Mock; leave: jest.Mock };
  let emit: jest.Mock;
  let to: jest.Mock;
  let prisma: {
    auction: { findFirst: jest.Mock };
    user: { findUnique: jest.Mock };
  };
  let live: { leave: jest.Mock };
  let jwt: { verifyAsync: jest.Mock };

  beforeEach(async () => {
    client = { id: 'socket-1', join: jest.fn(), leave: jest.fn() };
    emit = jest.fn();
    to = jest.fn(() => ({ emit }));
    prisma = {
      auction: { findFirst: jest.fn() },
      user: { findUnique: jest.fn() }
    };
    // the auction exists and is public unless a test says otherwise
    prisma.auction.findFirst.mockResolvedValue({ id: AUCTION_ID });
    prisma.user.findUnique.mockResolvedValue({ id: USER_ID, status: 'ACTIVE' });
    live = { leave: jest.fn() };
    jwt = { verifyAsync: jest.fn().mockResolvedValue({ sub: USER_ID }) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuctionGateway,
        PresenceRegistry,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
        { provide: ConfigService, useValue: { get: () => 'test-secret' } }
      ]
    }).compile();

    gateway = moduleRef.get(AuctionGateway);
    // The decorator assigns this at runtime; tests stand a server in its place.
    (gateway as unknown as { server: Partial<Server> }).server = {
      to
    };

    // Mirrors what LiveService registers at startup, so these tests exercise
    // the same path production does rather than a shortcut.
    gateway.onSocketPresenceReleased(async (gone) => {
      for (const { auctionId, userId } of gone) {
        await live.leave(auctionId, userId);
      }
    });
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

  /**
   * LIV-001 — a token is optional and changes nothing about the room. All it
   * buys is being noticed when the connection drops, so a participant count
   * stops including somebody who closed the tab.
   */
  describe('presence (LIV-001)', () => {
    const joinAs = (socketId: string, token?: string) => {
      client.id = socketId;
      return gateway.join(asSocket(), { auctionId: AUCTION_ID, token });
    };

    it('releases the person when their socket goes', async () => {
      await joinAs('socket-1', 'a-token');

      await gateway.handleDisconnect(asSocket());

      expect(live.leave).toHaveBeenCalledWith(AUCTION_ID, USER_ID);
    });

    it('leaves an anonymous socket untracked, and still lets it in', async () => {
      const result = await joinAs('socket-1');

      expect(result).toEqual({ auctionId: AUCTION_ID, joined: true });
      await gateway.handleDisconnect(asSocket());
      expect(live.leave).not.toHaveBeenCalled();
    });

    // the room is public, so rubbish costs the sender only the tracking
    it.each([
      ['a token that does not verify', 'bad-token'],
      ['a token for a suspended account', 'suspended']
    ])('lets a socket in with %s, untracked', async (_case, token) => {
      if (token === 'bad-token') {
        jwt.verifyAsync.mockRejectedValue(new Error('bad signature'));
      } else {
        prisma.user.findUnique.mockResolvedValue({
          id: USER_ID,
          status: 'SUSPENDED'
        });
      }

      const result = await joinAs('socket-1', token);

      expect(result.joined).toBe(true);
      await gateway.handleDisconnect(asSocket());
      expect(live.leave).not.toHaveBeenCalled();
    });

    it('accepts a bearer prefix as well as a bare token', async () => {
      await joinAs('socket-1', 'Bearer a-token');

      expect(jwt.verifyAsync).toHaveBeenCalledWith(
        'a-token',
        expect.anything()
      );
    });

    it('stops tracking a socket that left the room', async () => {
      await joinAs('socket-1', 'a-token');

      await gateway.leave(asSocket(), { auctionId: AUCTION_ID });
      await gateway.handleDisconnect(asSocket());

      // the explicit DELETE /participants is the person's own decision; the
      // disconnect has nothing left to release
      expect(live.leave).not.toHaveBeenCalled();
    });

    // a disconnect has nobody left to report an error to
    it('carries on when releasing one auction fails', async () => {
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      await joinAs('socket-1', 'a-token');
      live.leave.mockRejectedValue(new Error('database down'));

      await expect(
        gateway.handleDisconnect(asSocket())
      ).resolves.toBeUndefined();
    });

    it('releases a socket it never saw without complaint', async () => {
      client.id = 'never-seen';

      await expect(
        gateway.handleDisconnect(asSocket())
      ).resolves.toBeUndefined();
      expect(live.leave).not.toHaveBeenCalled();
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
      const detached = new AuctionGateway(
        prisma as unknown as PrismaService,
        new PresenceRegistry(),
        jwt as unknown as JwtService,
        { get: () => 'test-secret' } as unknown as ConfigService<
          EnvVariable,
          true
        >
      );

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
