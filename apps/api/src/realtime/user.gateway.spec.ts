import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { WsException } from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import { conversationRoom, UserGateway, userRoom } from './user.gateway';

const USER_ID = '00000000-0000-4000-8000-000000000801';
const OTHER_USER_ID = '00000000-0000-4000-8000-000000000802';
const CONVERSATION_ID = '00000000-0000-4000-8000-000000000901';

/**
 * SRS 4.1 — the per-person channel. Everything here is addressed to one
 * account, so this is about who a socket is allowed to be and what reaches
 * them.
 */
describe('UserGateway', () => {
  let gateway: UserGateway;
  let client: {
    join: jest.Mock;
    leave: jest.Mock;
    emit: jest.Mock;
    disconnect: jest.Mock;
    data: Record<string, unknown>;
    handshake: {
      auth: Record<string, unknown>;
      headers: Record<string, unknown>;
    };
  };
  let emit: jest.Mock;
  let to: jest.Mock;
  let prisma: {
    user: { findUnique: jest.Mock };
    conversation: { findUnique: jest.Mock };
  };
  let jwt: { verifyAsync: jest.Mock };

  beforeEach(async () => {
    client = {
      join: jest.fn(),
      leave: jest.fn(),
      emit: jest.fn(),
      disconnect: jest.fn(),
      data: {},
      handshake: { auth: { token: 'a-token' }, headers: {} }
    };
    emit = jest.fn();
    to = jest.fn(() => ({ emit }));

    prisma = {
      user: { findUnique: jest.fn() },
      conversation: { findUnique: jest.fn() }
    };
    // a real, active account unless a test says otherwise
    prisma.user.findUnique.mockResolvedValue({
      id: USER_ID,
      status: 'ACTIVE'
    });
    jwt = { verifyAsync: jest.fn().mockResolvedValue({ sub: USER_ID }) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        UserGateway,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
        { provide: ConfigService, useValue: { get: () => 'test-secret' } }
      ]
    }).compile();

    gateway = moduleRef.get(UserGateway);
    // The decorator assigns this at runtime; tests stand a server in its place.
    (gateway as unknown as { server: Partial<Server> }).server = { to };
  });

  const asSocket = () => client as unknown as Socket;

  describe('who a socket is allowed to be', () => {
    it('puts an identified socket in that person’s room', async () => {
      await gateway.handleConnection(asSocket());

      expect(client.join).toHaveBeenCalledWith(userRoom(USER_ID));
      expect(client.emit).toHaveBeenCalledWith('connection:ready', {
        userId: USER_ID
      });
      expect(client.disconnect).not.toHaveBeenCalled();
    });

    it('takes the token from the Authorization header too', async () => {
      client.handshake.auth = {};
      client.handshake.headers = { authorization: 'Bearer a-token' };

      await gateway.handleConnection(asSocket());

      expect(jwt.verifyAsync).toHaveBeenCalledWith(
        'a-token',
        expect.anything()
      );
      expect(client.join).toHaveBeenCalledWith(userRoom(USER_ID));
    });

    it('accepts a bearer prefix in the auth field as well as a bare token', async () => {
      client.handshake.auth = { token: 'Bearer a-token' };

      await gateway.handleConnection(asSocket());

      expect(jwt.verifyAsync).toHaveBeenCalledWith(
        'a-token',
        expect.anything()
      );
    });

    // there is nothing an unidentified socket could usefully do here
    it('disconnects a socket with no token', async () => {
      client.handshake.auth = {};

      await gateway.handleConnection(asSocket());

      expect(client.join).not.toHaveBeenCalled();
      expect(client.disconnect).toHaveBeenCalledWith(true);
    });

    it('disconnects a socket whose token does not verify', async () => {
      jwt.verifyAsync.mockRejectedValue(new Error('bad signature'));

      await gateway.handleConnection(asSocket());

      expect(client.join).not.toHaveBeenCalled();
      expect(client.disconnect).toHaveBeenCalledWith(true);
    });

    it('disconnects a token for an account that no longer exists', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await gateway.handleConnection(asSocket());

      expect(client.disconnect).toHaveBeenCalledWith(true);
    });

    // ADM-002 — a suspended account stops straight away, not when its token
    // happens to expire
    it('disconnects a suspended account', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        status: 'SUSPENDED'
      });

      await gateway.handleConnection(asSocket());

      expect(client.join).not.toHaveBeenCalled();
      expect(client.disconnect).toHaveBeenCalledWith(true);
    });

    // expired, forged and missing are one answer, as they are over HTTP
    it('never says which way the token was wrong', async () => {
      jwt.verifyAsync.mockRejectedValue(new Error('jwt expired'));

      await gateway.handleConnection(asSocket());

      const [event, payload] = client.emit.mock.calls[0] as [
        string,
        { reason: string }
      ];
      expect(event).toBe('connection:rejected');
      expect(payload).toEqual({ reason: 'Unauthorized' });
    });

    // the account is re-read rather than trusted from the token
    it('checks the account, not just the signature', async () => {
      await gateway.handleConnection(asSocket());

      expect(prisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: USER_ID } })
      );
    });
  });

  describe('sending to one person', () => {
    it('reaches their room and nobody else’s', () => {
      gateway.emitToUser(USER_ID, 'notification:created', { id: 'n1' });

      expect(to).toHaveBeenCalledWith(userRoom(USER_ID));
      expect(to).not.toHaveBeenCalledWith(userRoom(OTHER_USER_ID));
      expect(emit).toHaveBeenCalledWith('notification:created', { id: 'n1' });
    });

    // a bell that fails to light must not fail the transaction that raised it
    it('drops the event rather than throwing when no server is up', () => {
      (gateway as unknown as { server?: Server }).server = undefined;

      expect(() =>
        gateway.emitToUser(USER_ID, 'notification:created', {})
      ).not.toThrow();
    });
  });

  describe('joining a conversation’s room', () => {
    const asJoined = async () => {
      await gateway.handleConnection(asSocket());
      client.join.mockClear();
    };

    it('lets a participant in', async () => {
      await asJoined();
      prisma.conversation.findUnique.mockResolvedValue({
        buyerId: USER_ID,
        sellerId: OTHER_USER_ID
      });

      const result = await gateway.joinConversation(asSocket(), {
        conversationId: CONVERSATION_ID
      });

      expect(client.join).toHaveBeenCalledWith(
        conversationRoom(CONVERSATION_ID)
      );
      expect(result).toEqual({ conversationId: CONVERSATION_ID, joined: true });
    });

    it('lets the seller side in too', async () => {
      await asJoined();
      prisma.conversation.findUnique.mockResolvedValue({
        buyerId: OTHER_USER_ID,
        sellerId: USER_ID
      });

      await gateway.joinConversation(asSocket(), {
        conversationId: CONVERSATION_ID
      });

      expect(client.join).toHaveBeenCalledWith(
        conversationRoom(CONVERSATION_ID)
      );
    });

    // not-found rather than forbidden, matching chat.service.ts's own guard
    it('refuses an outsider', async () => {
      await asJoined();
      prisma.conversation.findUnique.mockResolvedValue({
        buyerId: OTHER_USER_ID,
        sellerId: 'someone-else'
      });

      await expect(
        gateway.joinConversation(asSocket(), {
          conversationId: CONVERSATION_ID
        })
      ).rejects.toBeInstanceOf(WsException);
      expect(client.join).not.toHaveBeenCalled();
    });

    it('refuses an id that is not a real conversation', async () => {
      await asJoined();
      prisma.conversation.findUnique.mockResolvedValue(null);

      await expect(
        gateway.joinConversation(asSocket(), {
          conversationId: CONVERSATION_ID
        })
      ).rejects.toBeInstanceOf(WsException);
    });

    // a socket that never proved its identity has nothing to check against
    it('refuses a socket that never identified itself', async () => {
      await expect(
        gateway.joinConversation(asSocket(), {
          conversationId: CONVERSATION_ID
        })
      ).rejects.toBeInstanceOf(WsException);
      expect(prisma.conversation.findUnique).not.toHaveBeenCalled();
    });

    it('leaves the room unconditionally', async () => {
      const result = await gateway.leaveConversation(asSocket(), {
        conversationId: CONVERSATION_ID
      });

      expect(client.leave).toHaveBeenCalledWith(
        conversationRoom(CONVERSATION_ID)
      );
      expect(result).toEqual({
        conversationId: CONVERSATION_ID,
        joined: false
      });
    });
  });

  describe('sending to a room', () => {
    it('reaches everyone in it', () => {
      gateway.emitToRoom(conversationRoom(CONVERSATION_ID), 'message:sent', {
        body: 'hi'
      });

      expect(to).toHaveBeenCalledWith(conversationRoom(CONVERSATION_ID));
      expect(emit).toHaveBeenCalledWith('message:sent', { body: 'hi' });
    });

    it('drops the event rather than throwing when no server is up', () => {
      (gateway as unknown as { server?: Server }).server = undefined;

      expect(() =>
        gateway.emitToRoom(
          conversationRoom(CONVERSATION_ID),
          'message:sent',
          {}
        )
      ).not.toThrow();
    });
  });
});
