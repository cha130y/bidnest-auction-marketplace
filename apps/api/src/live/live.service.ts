import {
  ConflictException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import type {
  AuctionStatus,
  ParticipantStatus
} from '../../generated/prisma/enums';
import { AuctionService } from '../auction/auction.service';
import { PUBLIC_AUCTION_STATUSES } from '../auction/constants/public-auction-status.constant';
import { bidHistorySelect, toPublicBid } from '../bid/bid-history.mapper';
import { LEADING_BID_ORDER } from '../bid/constants/leading-bid-order.constant';
import type { AuthenticatedUser } from '../common/types/authenticated-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { AuctionGateway } from '../realtime/auction.gateway';
import { calculateCountdown } from './utils/calculate-countdown.util';
import { describeBiddingAccess } from './utils/describe-bidding-access.util';

/**
 * LIV-001 — the statuses somebody can still take part in. A finished auction
 * is public to read (AUC-005) but there is nothing left to join: the lobby of
 * a SOLD auction is a results screen, and a participant list on it would only
 * grow for no reason.
 *
 * Written as an allow-list for the same reason PUBLIC_AUCTION_STATUSES is —
 * a status added later stays closed until somebody decides otherwise.
 */
export const JOINABLE_AUCTION_STATUSES: AuctionStatus[] = [
  'SCHEDULED',
  'ACTIVE'
];

/**
 * LIV-002 — how many of the latest bids the arena carries.
 *
 * Enough to read the shape of the bidding at a glance without a second call,
 * and small enough that it costs nothing on a busy auction. The whole history
 * is a separate, paged route (BID-005) for anyone who wants it.
 */
const ARENA_RECENT_BIDS = 10;

@Injectable()
export class LiveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auctionService: AuctionService,
    private readonly gateway: AuctionGateway
  ) {}

  /**
   * LIV-001 — everything the lobby screen needs in one read: the auction
   * itself, how many people are in it, how long until it starts or ends, and
   * whether the person looking has joined.
   *
   * The auction comes from AuctionService.findPublicAuction rather than a
   * query of its own, so the lobby cannot disagree with the REST read about
   * what is public, what a seller may see, or whether an auction that has run
   * out of time is still ACTIVE — that read repairs it (AUC-007), and this
   * gets the repaired answer for free.
   */
  async getLobby(auctionId: string, viewer?: AuthenticatedUser) {
    const auction = await this.auctionService.findPublicAuction(
      auctionId,
      viewer?.id
    );

    const [participantCount, participant] = await Promise.all([
      this.countParticipants(auctionId),
      viewer ? this.findParticipant(auctionId, viewer.id) : null
    ]);

    return {
      auction,
      participantCount,
      countdown: calculateCountdown(auction, new Date()),
      // Null rather than a false-ish object: nobody is signed in, which is a
      // different thing from being signed in and not having joined.
      you: viewer ? toViewerParticipation(participant) : null
    };
  }

  /**
   * LIV-002 — the arena, while the auction runs. Everything the lobby shows,
   * plus the three things that only matter once bidding is open: who is
   * leading, the latest bids, and the lowest amount that will be accepted.
   *
   * A separate read from the lobby rather than fields bolted onto it: a lobby
   * is looked at by people waiting for an auction that has no bids to show,
   * and it should not pay for the two extra queries.
   */
  async getArena(auctionId: string, viewer?: AuthenticatedUser) {
    const lobby = await this.getLobby(auctionId, viewer);

    const [leadingBid, recentBids] = await Promise.all([
      // Ordered the way settlement picks a winner, so the person shown to be
      // leading is the person who would actually win (AUC-007).
      this.prisma.bid.findFirst({
        where: { auctionId },
        orderBy: LEADING_BID_ORDER,
        select: bidHistorySelect
      }),
      // Newest first: an arena reads downwards from what just happened, which
      // is the opposite of the history route (BID-005).
      this.prisma.bid.findMany({
        where: { auctionId },
        orderBy: { sequenceNo: 'desc' },
        take: ARENA_RECENT_BIDS,
        select: bidHistorySelect
      })
    ]);

    // The arena's control needs to know whether it is usable, which the lobby
    // has no reason to answer.
    const you =
      viewer && lobby.you
        ? { ...lobby.you, ...describeBiddingAccess(lobby.auction, viewer) }
        : null;

    return {
      ...lobby,
      // BID-005's mapper, so the leader is masked by exactly the same rule the
      // history and the broadcast use — one person reads as one person across
      // all three.
      leader: leadingBid ? toPublicBid(leadingBid, viewer?.id) : null,
      recentBids: recentBids.map((bid) => toPublicBid(bid, viewer?.id)),
      you
    };
  }

  /**
   * LIV-001 — takes part in an auction. Joining is not bidding: the seller may
   * join their own auction (they cannot bid on it, BID-001) and so may anyone
   * who never bids at all. It only records that somebody is here, which is
   * what the lobby counts.
   *
   * Idempotent — joining twice leaves one row and announces nothing the second
   * time, so a client that reconnects and rejoins does not make the number
   * jump.
   */
  async join(auctionId: string, userId: string) {
    await this.assertJoinable(auctionId);

    const now = new Date();
    const existing = await this.findParticipant(auctionId, userId);
    const wasJoined = existing?.status === 'JOINED';

    const participant = await this.prisma.auctionParticipant.upsert({
      where: { auctionId_userId: { auctionId, userId } },
      create: { auctionId, userId, status: 'JOINED', lastSeenAt: now },
      // `joinedAt` is deliberately not touched: it means the first time this
      // person joined this auction, and somebody coming back after leaving is
      // the same person returning, not a new arrival.
      update: { status: 'JOINED', lastSeenAt: now },
      select: { joinedAt: true }
    });

    const participantCount = await this.countParticipants(auctionId);

    if (!wasJoined) this.announcePresence(auctionId, participantCount);

    return {
      auctionId,
      joined: true,
      joinedAt: participant.joinedAt,
      participantCount
    };
  }

  /**
   * LIV-001 — leaves the auction. The row stays as LEFT rather than being
   * deleted: the schema keeps a status for exactly this, and it is what lets a
   * returning bidder keep the time they first arrived.
   */
  async leave(auctionId: string, userId: string) {
    const { count } = await this.prisma.auctionParticipant.updateMany({
      where: { auctionId, userId, status: 'JOINED' },
      data: { status: 'LEFT', lastSeenAt: new Date() }
    });

    const participantCount = await this.countParticipants(auctionId);

    // Nothing changed if they were not here to begin with, and a room should
    // not be told about a number that did not move.
    if (count === 1) this.announcePresence(auctionId, participantCount);

    return { auctionId, joined: false, participantCount };
  }

  /**
   * LIV-001 — "realtime" is this: the count is pushed to the room rather than
   * polled for.
   *
   * `at` is the moment the count was read. Two people joining at once each
   * read their own count and each announce it, so the two events can arrive in
   * either order; a client that keeps the newest `at` renders the later of the
   * two rather than whichever happened to land last.
   */
  private announcePresence(auctionId: string, participantCount: number): void {
    this.gateway.emitToAuction(auctionId, 'auction:presence', {
      auctionId,
      participantCount,
      at: new Date()
    });
  }

  private countParticipants(auctionId: string): Promise<number> {
    return this.prisma.auctionParticipant.count({
      where: { auctionId, status: 'JOINED' }
    });
  }

  private findParticipant(auctionId: string, userId: string) {
    return this.prisma.auctionParticipant.findUnique({
      where: { auctionId_userId: { auctionId, userId } },
      select: { status: true, joinedAt: true }
    });
  }

  /**
   * An auction nobody may see and an auction that has finished are different
   * answers. The first is 404 because a draft is private and "you cannot join
   * it" would confirm it exists; the second is 409 because the auction is
   * plainly there and its state is the problem.
   *
   * The public check is the shared PUBLIC_AUCTION_STATUSES, so joining cannot
   * become a way to find out about an auction the REST read hides.
   */
  private async assertJoinable(auctionId: string): Promise<void> {
    const auction = await this.prisma.auction.findFirst({
      where: {
        id: auctionId,
        status: { in: PUBLIC_AUCTION_STATUSES },
        deletedAt: null
      },
      select: { status: true }
    });

    if (!auction) throw new NotFoundException('Auction not found');

    if (!JOINABLE_AUCTION_STATUSES.includes(auction.status)) {
      throw new ConflictException('Auction is no longer running');
    }
  }
}

type ParticipantRow = { status: ParticipantStatus; joinedAt: Date } | null;

/**
 * LIV-001 — "สถานะการเข้าร่วม" for the person looking. A row that says LEFT
 * reads the same as no row at all: they are not here now, which is the only
 * thing the lobby asks. `joinedAt` comes back only while they are, so a screen
 * cannot show "joined 20 minutes ago" to somebody who has since left.
 */
function toViewerParticipation(participant: ParticipantRow) {
  const joined = participant?.status === 'JOINED';

  return { joined, joinedAt: joined ? participant.joinedAt : null };
}
