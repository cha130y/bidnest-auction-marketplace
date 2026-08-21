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
import { PUBLIC_AUCTION_STATUSES } from '../auction/constants/public-auction-status.constant';
import { PrismaService } from '../prisma/prisma.service';

/** One room per auction — everyone watching the same auction, and nobody else. */
export const auctionRoom = (auctionId: string) => `auction:${auctionId}`;

type JoinPayload = { auctionId?: unknown };
type JoinResult = { auctionId: string; joined: boolean };

/**
 * BID-003 — the realtime side of an auction. Rooms are per auction, so a bid
 * only reaches the people watching that one.
 *
 * Joining needs no token: a published auction is public to read (AUC-005), and
 * this room carries exactly what the public GET already returns. Nothing here
 * is per-viewer, so there is nothing to authorise. Bidding still goes through
 * the HTTP endpoint and its guards — this socket accepts no bids.
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
  constructor(private readonly prisma: PrismaService) {}

  private readonly logger = new Logger(AuctionGateway.name);

  @WebSocketServer()
  private server?: Server;

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

    return { auctionId, joined: true };
  }

  @SubscribeMessage('auction:leave')
  async leave(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: JoinPayload | undefined
  ): Promise<JoinResult> {
    const auctionId = readAuctionId(payload);
    await client.leave(auctionRoom(auctionId));

    return { auctionId, joined: false };
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
