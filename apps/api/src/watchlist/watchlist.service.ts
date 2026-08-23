import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import {
  auctionRowSelect,
  toOwnerAuction,
  toPublicAuction
} from '../auction/auction.mapper';
import { PUBLIC_AUCTION_STATUSES } from '../auction/constants/public-auction-status.constant';
import { toPublicBid } from '../bid/bid-history.mapper';
import { calculateCountdown } from '../live/utils/calculate-countdown.util';
import { describeAuctionResult } from '../live/utils/describe-auction-result.util';
import { PrismaService } from '../prisma/prisma.service';
import { ListWatchlistDto } from './dtos/list-watchlist.dto';

/** Matches the auction list and the bid history, so all three page alike. */
const DEFAULT_WATCHLIST_PAGE_SIZE = 20;

/**
 * The winning bids for a page of auctions, loaded in one query rather than one
 * per row. `wonAuction` is selected so each bid can be matched back to the
 * auction it won.
 */
const watchedWinnerSelect = {
  id: true,
  amount: true,
  sequenceNo: true,
  placedAt: true,
  bidderId: true,
  bidder: { select: { profile: { select: { displayName: true } } } },
  wonAuction: { select: { id: true } }
} satisfies Prisma.BidSelect;

@Injectable()
export class WatchlistService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * WAT-001 — puts one public auction on the caller's watchlist.
   *
   * One at a time, as the criterion says: there is no endpoint that takes a
   * list, so a client cannot half-succeed at adding five and have to work out
   * which ones landed.
   *
   * Idempotent — watching something twice leaves one row and answers the same
   * way, so a double tap on a slow connection is not an error.
   */
  async watch(auctionId: string, userId: string) {
    await this.assertAuctionIsPublic(auctionId);

    const entry = await this.prisma.watchlist.upsert({
      where: { userId_auctionId: { userId, auctionId } },
      create: { userId, auctionId },
      // Nothing to change: the row exists or it does not. `createdAt` keeps the
      // first time they added it, so the list order does not jump around when
      // somebody taps twice.
      update: {},
      select: { createdAt: true }
    });

    return { auctionId, watching: true, watchedAt: entry.createdAt };
  }

  /**
   * WAT-001 — takes one auction off the watchlist. Deleted rather than flagged:
   * unlike a participant, a watcher has no state worth keeping once they stop
   * watching, and the schema gives the row no status to hold.
   *
   * Removing something that was never there is not an error — the caller wanted
   * it gone, and it is gone.
   */
  async unwatch(auctionId: string, userId: string) {
    const { count } = await this.prisma.watchlist.deleteMany({
      where: { userId, auctionId }
    });

    return { auctionId, watching: false, removed: count === 1 };
  }

  /**
   * WAT-002 — the caller's watchlist: for each auction its status, how long is
   * left, what it costs now, and how it ended.
   *
   * Scoped by userId in the query rather than filtered afterwards, so there is
   * no path where somebody else's list could come back.
   */
  async listOwn(userId: string, dto: ListWatchlistDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? DEFAULT_WATCHLIST_PAGE_SIZE;

    // An auction that has since been cancelled or rolled back to draft drops
    // out of the list rather than appearing as a row nobody may open.
    const where = {
      userId,
      auction: { status: { in: PUBLIC_AUCTION_STATUSES }, deletedAt: null }
    } satisfies Prisma.WatchlistWhereInput;

    const [entries, total] = await Promise.all([
      this.prisma.watchlist.findMany({
        where,
        // Most recently watched first; the auction id breaks ties so paging
        // stays stable when two rows share a timestamp.
        orderBy: [{ createdAt: 'desc' }, { auctionId: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          createdAt: true,
          auction: { select: auctionRowSelect }
        }
      }),
      this.prisma.watchlist.count({ where })
    ]);

    const winners = await this.findWinners(
      entries.map((entry) => entry.auction.id),
      userId
    );

    // One instant for the whole page, so no two countdowns on screen disagree
    // about what time it is.
    const now = new Date();

    return {
      items: entries.map((entry) => {
        const auction =
          entry.auction.sellerId === userId
            ? toOwnerAuction(entry.auction)
            : toPublicAuction(entry.auction);

        return {
          watchedAt: entry.createdAt,
          auction,
          countdown: calculateCountdown(auction, now),
          result: describeAuctionResult(
            auction,
            winners.get(entry.auction.id) ?? null
          )
        };
      }),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) }
    };
  }

  /**
   * The recorded winner of each sold auction on the page, keyed by auction.
   * One query for the page rather than one per row — a watchlist of twenty
   * finished auctions should not cost twenty round trips.
   *
   * The viewer is passed through so `isYours` is true on an auction they won.
   * Whether you won the thing you were following is the first question this
   * screen has to answer, and a masked name cannot answer it.
   */
  private async findWinners(auctionIds: string[], viewerId: string) {
    if (auctionIds.length === 0) return new Map<string, never>();

    const bids = await this.prisma.bid.findMany({
      where: { wonAuction: { id: { in: auctionIds } } },
      select: watchedWinnerSelect
    });

    return new Map(
      bids.map(
        (bid) => [bid.wonAuction!.id, toPublicBid(bid, viewerId)] as const
      )
    );
  }

  /**
   * WAT-001 — "ประมูลสาธารณะ". Checked against the shared status list, so the
   * watchlist cannot become a way to confirm a private draft exists: an auction
   * nobody may see answers exactly as an id that was never an auction.
   *
   * Every public status counts, including the finished ones — watching an
   * auction that has ended is how somebody keeps its result in front of them,
   * which is the opposite of joining one (LIV-001), where there is nothing left
   * to take part in.
   */
  private async assertAuctionIsPublic(auctionId: string): Promise<void> {
    const auction = await this.prisma.auction.findFirst({
      where: {
        id: auctionId,
        status: { in: PUBLIC_AUCTION_STATUSES },
        deletedAt: null
      },
      select: { id: true }
    });

    if (!auction) throw new NotFoundException('Auction not found');
  }
}
