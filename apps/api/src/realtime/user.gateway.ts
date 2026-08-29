import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { EnvVariable } from '../config/env.validation';
import { PrismaService } from '../prisma/prisma.service';

/** One room per person — everything addressed to them, and nobody else. */
export const userRoom = (userId: string) => `user:${userId}`;

/** CHAT-001..003 — one room per thread, joined only by its two participants. */
export const conversationRoom = (conversationId: string) =>
  `conversation:${conversationId}`;

/** One room per support session, joined by its owner and any admin. */
export const supportRoom = (sessionId: string) => `support:${sessionId}`;

/**
 * Every connected admin auto-joins this on connect — it's what lets the
 * `/admin/support` list page update live (a new escalation, a new message on
 * someone else's thread) without a per-session join message.
 */
export const SUPPORT_ADMIN_INBOX_ROOM = 'support:admin-inbox';

type AccessTokenClaims = { sub: string };
type Identity = { userId: string; role: string };
type JoinConversationPayload = { conversationId?: unknown };
type JoinConversationResult = { conversationId: string; joined: boolean };
type JoinSupportPayload = { sessionId?: unknown };
type JoinSupportResult = { sessionId: string; joined: boolean };

/**
 * SRS 4.1 — the channel for pushing things at one person: notifications
 * (NOT-001..008), and order and shipment status for the buyer and the seller.
 *
 * A separate namespace from `/auctions` because the two have opposite
 * security properties. An auction room is public to read (AUC-005), so that
 * gateway deliberately authenticates nobody; everything here is addressed to
 * one account, so a socket that cannot prove who it is has no business being
 * connected at all.
 *
 * Authentication happens on connection rather than on a subscribe message, so
 * there is never a moment where an unidentified socket is attached to this
 * namespace waiting to say who it is.
 */
@WebSocketGateway({
  namespace: '/user',
  cors: {
    // Resolved per request rather than captured here: the decorator runs
    // before ConfigModule has loaded .env into process.env.
    origin: (
      _origin: string | undefined,
      callback: (error: Error | null, origin?: string) => void
    ) => callback(null, process.env.WEB_APP_URL),
    credentials: true
  }
})
export class UserGateway {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<EnvVariable, true>
  ) {}

  private readonly logger = new Logger(UserGateway.name);

  @WebSocketServer()
  private server?: Server;

  /**
   * Nest calls this for every socket that reaches the namespace. A socket that
   * cannot be identified is disconnected rather than left idle: there is
   * nothing it could usefully do here.
   */
  async handleConnection(client: Socket): Promise<void> {
    const identity = await this.identify(client);

    if (!identity) {
      // Expired, forged and missing are one answer, as they are over HTTP:
      // never say which it was.
      client.emit('connection:rejected', { reason: 'Unauthorized' });
      client.disconnect(true);
      return;
    }

    // Remembered for 'conversation:join'/'support:join' below, so those
    // messages do not have to re-verify the token: this socket already
    // proved who it is once.
    (client.data as { userId?: string; role?: string }).userId =
      identity.userId;
    (client.data as { userId?: string; role?: string }).role = identity.role;

    await client.join(userRoom(identity.userId));
    // An admin's dashboard needs live updates the moment a new session is
    // escalated, not just once it has opened one specific thread.
    if (identity.role === 'ADMIN') {
      await client.join(SUPPORT_ADMIN_INBOX_ROOM);
    }
    client.emit('connection:ready', { userId: identity.userId });
  }

  /**
   * CHAT-001..003 — the join path RealtimeService.emitMessageSent was left
   * waiting for. A thread has exactly two participants, so unlike an auction
   * room this has to check who is asking before letting a socket in.
   *
   * `client.data.userId` is only set once `handleConnection` has identified
   * the socket, so a socket that raced this message before then (or never
   * proved itself, and so was already disconnected) has nothing to be
   * checked against and is refused.
   */
  @SubscribeMessage('conversation:join')
  async joinConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: JoinConversationPayload | undefined
  ): Promise<JoinConversationResult> {
    const conversationId = readConversationId(payload);
    const userId = (client.data as { userId?: string }).userId;

    const conversation = userId
      ? await this.prisma.conversation.findUnique({
          where: { id: conversationId },
          select: { buyerId: true, sellerId: true }
        })
      : null;

    const isParticipant =
      !!conversation &&
      (conversation.buyerId === userId || conversation.sellerId === userId);

    // Not-found rather than forbidden, same as the REST side (assertParticipant
    // in chat.service.ts) — an outsider should not be able to tell a thread
    // exists from the socket refusing them any differently than a bad id.
    if (!isParticipant) throw new WsException('Conversation not found');

    await client.join(conversationRoom(conversationId));
    return { conversationId, joined: true };
  }

  @SubscribeMessage('conversation:leave')
  async leaveConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: JoinConversationPayload | undefined
  ): Promise<JoinConversationResult> {
    const conversationId = readConversationId(payload);
    await client.leave(conversationRoom(conversationId));
    return { conversationId, joined: false };
  }

  /**
   * A support session has one owner and, unlike a conversation, a whole
   * second class of participant — any admin, not one specific pair.
   */
  @SubscribeMessage('support:join')
  async joinSupport(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: JoinSupportPayload | undefined
  ): Promise<JoinSupportResult> {
    const sessionId = readSessionId(payload);
    const data = client.data as { userId?: string; role?: string };

    if (data.role === 'ADMIN') {
      await client.join(supportRoom(sessionId));
      return { sessionId, joined: true };
    }

    const session = data.userId
      ? await this.prisma.supportChatSession.findUnique({
          where: { id: sessionId },
          select: { userId: true }
        })
      : null;

    // Not-found rather than forbidden, same posture as conversation:join.
    if (session?.userId !== data.userId) {
      throw new WsException('Support session not found');
    }

    await client.join(supportRoom(sessionId));
    return { sessionId, joined: true };
  }

  @SubscribeMessage('support:leave')
  async leaveSupport(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: JoinSupportPayload | undefined
  ): Promise<JoinSupportResult> {
    const sessionId = readSessionId(payload);
    await client.leave(supportRoom(sessionId));
    return { sessionId, joined: false };
  }

  /**
   * Whoever this socket belongs to, or null.
   *
   * The account is re-read rather than trusted from the token, for the reason
   * AccessTokenGuard does the same: ADM-002 says a suspended account stops
   * transacting straight away, and a socket that opened before the suspension
   * would otherwise keep receiving that person's notifications until its
   * token expired.
   */
  private async identify(client: Socket): Promise<Identity | null> {
    const token = readToken(client);
    if (!token) return null;

    let claims: AccessTokenClaims;
    try {
      claims = await this.jwt.verifyAsync<AccessTokenClaims>(token, {
        secret: this.config.get('JWT_ACCESS_SECRET', { infer: true })
      });
    } catch {
      return null;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: claims.sub },
      select: { id: true, status: true, role: true }
    });

    return user?.status === 'ACTIVE'
      ? { userId: user.id, role: user.role }
      : null;
  }

  /**
   * Sends one event to one person, on every device they have open.
   *
   * Nothing is thrown when there is no server or nobody is listening: a
   * notification is already on record by the time this runs, and a bell that
   * fails to light must not fail the transaction that raised it.
   */
  emitToUser(userId: string, event: string, payload: unknown): void {
    this.emitToRoom(userRoom(userId), event, payload);
  }

  /** CHAT-001..003 — the same drop-rather-than-throw contract as emitToUser. */
  emitToRoom(room: string, event: string, payload: unknown): void {
    if (!this.server) {
      this.logger.debug(`No socket server yet, dropping ${event}`);
      return;
    }

    this.server.to(room).emit(event, payload);
  }
}

/** A malformed id is refused by the Prisma lookup finding nothing, same as `WsException` would. */
function readConversationId(
  payload: JoinConversationPayload | undefined
): string {
  return typeof payload?.conversationId === 'string'
    ? payload.conversationId
    : '';
}

function readSessionId(payload: JoinSupportPayload | undefined): string {
  return typeof payload?.sessionId === 'string' ? payload.sessionId : '';
}

/**
 * The token, from wherever socket.io clients can put one. `auth` is the
 * documented place and what a browser client uses; the Authorization header is
 * accepted too because non-browser clients often cannot set `auth`.
 */
function readToken(client: Socket): string | null {
  // `auth` is whatever the client sent, so it is narrowed rather than trusted.
  const auth = client.handshake.auth as Record<string, unknown> | undefined;
  const fromAuth = auth?.token;

  if (typeof fromAuth === 'string' && fromAuth.length > 0) {
    return stripBearer(fromAuth);
  }

  const header = client.handshake.headers.authorization;
  return typeof header === 'string' ? stripBearer(header) : null;
}

function stripBearer(value: string): string | null {
  const [scheme, rest] = value.split(' ');

  if (scheme?.toLowerCase() === 'bearer') return rest || null;

  // A bare token with no scheme is accepted: `auth: { token }` is the natural
  // place to put one, and requiring "Bearer " there would be ceremony.
  return value || null;
}
