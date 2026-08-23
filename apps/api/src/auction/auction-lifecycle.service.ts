import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { AuctionGateway } from '../realtime/auction.gateway';
import { AuctionService } from './auction.service';

/**
 * How often the lifecycle is reconciled. Ten seconds is close enough that a
 * countdown on screen never disagrees with the server for long, and cheap
 * enough that the query costs nothing at this size.
 */
const LIFECYCLE_INTERVAL_MS = 10_000;

/**
 * How many auctions one pass may touch. A batch keeps a burst of auctions all
 * ending at once from holding the database for an unbounded stretch; whatever
 * is left over is picked up ten seconds later.
 */
const LIFECYCLE_BATCH_SIZE = 50;

/**
 * AUC-005 / AUC-007 — moves auctions through the two transitions that are
 * driven by the clock rather than by a person: SCHEDULED becomes ACTIVE when
 * its start time arrives, and ACTIVE is settled once its end time passes.
 *
 * Without this, an auction only changes when somebody happens to read it, so
 * one nobody opens would stay ACTIVE for ever and a SCHEDULED one would never
 * start at all.
 */
@Injectable()
export class AuctionLifecycleService {
  private readonly logger = new Logger(AuctionLifecycleService.name);

  /**
   * A slow pass must not overlap the next tick. Settling is a loop of
   * transactions, so a large batch can outlive the interval; without this flag
   * the passes would pile up on the same rows.
   */
  private reconciling = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auctionService: AuctionService,
    private readonly gateway: AuctionGateway
  ) {}

  @Interval(LIFECYCLE_INTERVAL_MS)
  async reconcileLifecycle(): Promise<void> {
    if (this.reconciling) return;

    this.reconciling = true;

    try {
      const started = await this.startDueAuctions();
      const settled = await this.settleDueAuctions();

      if (started > 0 || settled > 0) {
        this.logger.log(
          `Auction lifecycle: ${started} started, ${settled} settled`
        );
      }
    } catch (error: unknown) {
      // A failed pass must not take the timer down with it — the next tick
      // should get another go at the same rows.
      const message = error instanceof Error ? error.message : 'Unknown error';
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Auction lifecycle pass failed: ${message}`, stack);
    } finally {
      this.reconciling = false;
    }
  }

  /**
   * AUC-005 — a SCHEDULED auction whose start time has arrived opens for
   * bidding. `currentEndAt` must be set, which the AUC-002 gate guarantees for
   * anything that was published; the check is here so a row that somehow lacks
   * one is left alone rather than started with no end in sight.
   */
  private async startDueAuctions(): Promise<number> {
    const now = new Date();

    const due = await this.prisma.auction.findMany({
      where: {
        status: 'SCHEDULED',
        scheduledStartAt: { lte: now },
        currentEndAt: { not: null },
        deletedAt: null
      },
      orderBy: [{ scheduledStartAt: 'asc' }, { id: 'asc' }],
      take: LIFECYCLE_BATCH_SIZE,
      // currentEndAt rides along for the broadcast below — a SCHEDULED auction
      // has no bids, so nothing can have moved its end time since this read.
      select: { id: true, currentEndAt: true }
    });

    let started = 0;

    for (const auction of due) {
      const opened = await this.prisma.$transaction(async (tx) => {
        const { count } = await tx.auction.updateMany({
          // Guarded on SCHEDULED, so a seller cancelling in the same moment
          // wins or loses cleanly instead of both writes landing.
          where: {
            id: auction.id,
            status: 'SCHEDULED',
            scheduledStartAt: { lte: now },
            deletedAt: null
          },
          data: {
            status: 'ACTIVE',
            startedAt: now,
            rowVersion: { increment: 1 }
          }
        });

        if (count !== 1) return false;

        await tx.auctionEvent.create({
          data: { auctionId: auction.id, eventType: 'STARTED' }
        });

        return true;
      });

      if (!opened) continue;

      started += 1;

      /**
       * LIV-001 — the lobby has to flip to the arena by itself when the clock
       * runs out, and SRS section 6 puts this after the commit: an auction
       * announced as open from inside the transaction could still be rolled
       * back, and there is no unsending that.
       *
       * Without it a lobby would only learn the auction had started by asking
       * again, so the countdown would hit zero and the screen would sit there.
       */
      this.gateway.emitToAuction(auction.id, 'auction:started', {
        auctionId: auction.id,
        status: 'ACTIVE',
        startedAt: now,
        endsAt: auction.currentEndAt
      });
    }

    return started;
  }

  /**
   * AUC-007 — settles auctions whose end time has passed. The decision itself
   * lives in AuctionService.settleAuction, which is also what a read calls, so
   * a timer and a reader can never reach different verdicts.
   */
  private async settleDueAuctions(): Promise<number> {
    const due = await this.prisma.auction.findMany({
      where: {
        status: 'ACTIVE',
        currentEndAt: { lte: new Date() },
        deletedAt: null
      },
      orderBy: [{ currentEndAt: 'asc' }, { id: 'asc' }],
      take: LIFECYCLE_BATCH_SIZE,
      select: { id: true }
    });

    let settled = 0;

    for (const auction of due) {
      // Returns null when somebody else got there first, which is not an error.
      const result = await this.auctionService.settleAuction(auction.id);
      if (result) settled += 1;
    }

    return settled;
  }
}
