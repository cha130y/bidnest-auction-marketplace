import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException
} from '@nestjs/websockets';
import { isUUID } from 'class-validator';
import type { Server, Socket } from 'socket.io';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PUBLIC_AUCTION_STATUSES } from '../auction/constants/public-auction-status.constant';
import { EnvVariable } from '../config/env.validation';
import { PrismaService } from '../prisma/prisma.service';
import { Membership, PresenceRegistry } from './presence-registry';

/** One room per auction — everyone watching the same auction, and nobody else. */
export const auctionRoom = (auctionId: string) => `auction:${auctionId}`;

type JoinPayload = { auctionId?: unknown; token?: unknown };
type JoinResult = { auctionId: string; joined: boolean };

/**
 * BID-003 — the realtime side of an auction. Rooms are per auction, so a bid
 * only reaches the people watching that one.
 *
 * Joining needs no token: a published auction is public to read (AUC-005), and
 * this room carries exactly what the public GET already returns. Nothing here
 * is per-viewer, so there is nothing to authorise. Bidding still goes through
 * the HTTP endpoint and its guards — this socket accepts no bids.
 *
 * LIV-001 — a token may be sent anyway, and is honoured the way the REST lobby
 * honours one: it changes nothing about what the room sends, and only lets the
 * server notice when that person's connection drops, so a participant count
 * stops including somebody who closed the tab. A socket without one still
 * joins and still sees everything.
 */
@WebSocketGateway({
  namespace: '/auctions',
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
export class AuctionGateway {
  constructor(
    private readonly prisma: PrismaService,
    private readonly presence: PresenceRegistry,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<EnvVariable, true>
  ) {}

  private readonly logger = new Logger(AuctionGateway.name);

  @WebSocketServer()
  private server?: Server;

  /**
   * What to do about the people a dropped socket was standing in for.
   *
   * Registered by LiveService at startup rather than injected, and that is the
   * whole point: only the transport knows a connection has gone, and only the
   * feature knows what being present means. Importing LiveService here would
   * close a loop — LiveService already announces *through* this gateway — and
   * that loop spreads, because AuctionService depends on this gateway too.
   *
   * Handing the feature a place to register keeps every import pointing one
   * way. See LiveService.onModuleInit for the other end.
   */
  private releasePresence?: (gone: Membership[]) => Promise<void>;

  onSocketPresenceReleased(
    handler: (gone: Membership[]) => Promise<void>
  ): void {
    this.releasePresence = handler;
  }

  @SubscribeMessage('auction:join')
  async join(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: JoinPayload | undefined
  ): Promise<JoinResult> {
    const auctionId = readAuctionId(payload);

    // The room has to mean the same thing the REST route does. Without this a
    // client could sit in the room of a draft, or of an id that was never an
    // auction at all — harmless while `auction:bid` is the only event, since
    // that needs an ACTIVE auction, but it would quietly become a way around
    // AUC-005 the moment anything else is broadcast. It also stops a client
    // opening unlimited rooms out of nothing.
    const auction = await this.prisma.auction.findFirst({
      where: {
        id: auctionId,
        status: { in: PUBLIC_AUCTION_STATUSES },
        deletedAt: null
      },
      select: { id: true }
    });

    if (!auction) throw new WsException('Auction not found');

    await client.join(auctionRoom(auctionId));

    // LIV-001 — remembered only so a dropped connection can be noticed later.
    // An anonymous socket simply is not remembered, and joins all the same.
    const userId = await this.identify(payload?.token);
    if (userId) this.presence.register(client.id, auctionId, userId);

    return { auctionId, joined: true };
  }

  @SubscribeMessage('auction:leave')
  async leave(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: JoinPayload | undefined
  ): Promise<JoinResult> {
    const auctionId = readAuctionId(payload);
    await client.leave(auctionRoom(auctionId));

    // Leaving the room is not leaving the auction: the participant row is the
    // person's own decision, made over HTTP (DELETE /participants). All this
    // drops is the connection that was standing in for them.
    this.presence.unregister(client.id, auctionId);

    return { auctionId, joined: false };
  }

  /**
   * LIV-001 — the point of all of this: a socket that goes away takes its
   * person's presence with it, so a lobby stops counting somebody who closed
   * the tab, lost their connection or walked out of signal.
   *
   * Only when it was their last connection to that auction — two tabs on the
   * same auction are one person, and closing one of them is not leaving.
   *
   * The handler LiveService registered does the work, so a disconnect and an
   * explicit DELETE /participants take exactly the same path and announce the
   * same way.
   */
  async handleDisconnect(client: Socket): Promise<void> {
    const gone = this.presence.releaseSocket(client.id);

    if (gone.length === 0 || !this.releasePresence) return;

    try {
      await this.releasePresence(gone);
    } catch (error: unknown) {
      // A disconnect has nobody left to report an error to, and throwing here
      // would only take down the socket that has already gone.
      const message = error instanceof Error ? error.message : 'Unknown';
      this.logger.error(`Failed to release presence: ${message}`);
    }
  }

  /**
   * Whoever sent this token, or null for anybody who sent none, sent a bad
   * one, or is no longer an active account (ADM-002).
   *
   * A bad token is not an error here. The room is public, so the only thing a
   * caller loses by sending rubbish is the presence tracking they would have
   * got — refusing the join would take away something they were entitled to.
   */
  private async identify(token: unknown): Promise<string | null> {
    if (typeof token !== 'string' || token.length === 0) return null;

    const bearer = token.startsWith('Bearer ') ? token.slice(7) : token;

    try {
      const claims = await this.jwt.verifyAsync<{ sub: string }>(bearer, {
        secret: this.config.get('JWT_ACCESS_SECRET', { infer: true })
      });

      const user = await this.prisma.user.findUnique({
        where: { id: claims.sub },
        select: { id: true, status: true }
      });

      return user?.status === 'ACTIVE' ? user.id : null;
    } catch {
      return null;
    }
  }

  /**
   * SRS section 6 — only ever called after the transaction that accepted the
   * bid has committed. Broadcasting from inside one would announce a bid that
   * a rollback could still take away.
   */
  emitToAuction(auctionId: string, event: string, payload: unknown): void {
    // Undefined until a client connects, which is normal: an auction can run
    // with nobody watching, and a bid must not fail because of it.
    if (!this.server) {
      this.logger.debug(`No socket server yet, dropping ${event}`);
      return;
    }

    this.server.to(auctionRoom(auctionId)).emit(event, payload);
  }
}

/**
 * A socket payload is whatever the client sent, so it is checked here rather
 * than trusted. Returning a result instead of throwing keeps a malformed
 * message from taking the connection down.
 */
function readAuctionId(payload: JoinPayload | undefined): string {
  const auctionId = payload?.auctionId;

  if (typeof auctionId !== 'string' || !isUUID(auctionId)) {
    throw new Error('auctionId must be a uuid');
  }

  return auctionId;
}
