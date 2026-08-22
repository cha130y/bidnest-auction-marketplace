import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '../../generated/prisma/client';
import { LEADING_BID_ORDER } from '../bid/constants/leading-bid-order.constant';
import { PrismaService } from '../prisma/prisma.service';
import { AuctionGateway } from '../realtime/auction.gateway';
import {
  settledWinnerSelect,
  toAuctionEndedEvent
} from './auction-ended-event.mapper';
import {
  auctionRowSelect,
  auctionPublishGateSelect,
  toOwnerAuction,
  toPublicAuction
} from './auction.mapper';
import { HOT_AUCTION_ORDER } from './constants/hot-auction-order.constant';
import { PUBLIC_AUCTION_STATUSES } from './constants/public-auction-status.constant';
import { CreateAuctionDraftDto } from './dtos/create-auction-draft.dto';
import { ListHotAuctionsDto } from './dtos/list-hot-auctions.dto';
import { UpdateAuctionDto } from './dtos/update-auction.dto';
import {
  assertAuctionIsCancellable,
  assertAuctionIsEditable
} from './utils/assert-seller-can-change.util';
import { calculateReserveMet } from './utils/calculate-reserve-met.util';
import { validateDraftForPublish } from './utils/validate-draft-for-publish.util';

/** Matches the product catalogue, so both lists page the same way. */
const DEFAULT_HOT_PAGE_SIZE = 20;

@Injectable()
export class AuctionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: AuctionGateway
  ) {}

  /**
   * AUC-001 — a draft is private to its seller and lands in DRAFT, the only
   * status the lifecycle lets a seller create directly (SRS 4.2).
   */
  async createDraft(sellerId: string, dto: CreateAuctionDraftDto) {
    await this.assertCategoryIsActive(dto.categoryId);

    const auction = await this.prisma.auction.create({
      data: {
        sellerId,
        categoryId: dto.categoryId,
        title: dto.title,
        description: dto.description,
        condition: dto.condition,
        status: 'DRAFT',
        startingPrice: dto.startingPrice,
        minBidIncrement: dto.minBidIncrement,
        reservePrice: dto.reservePrice,
        scheduledStartAt: dto.scheduledStartAt,
        // originalEndAt holds the end time before any anti-sniping extension
        // (BID-004), so both columns start out as the drafted end time.
        originalEndAt: dto.scheduledEndAt,
        currentEndAt: dto.scheduledEndAt,
        images: {
          create: (dto.imageUrls ?? []).map((url, index) => ({
            storageKey: `${sellerId}/${randomUUID()}/${index}`,
            url,
            position: index,
            isPrimary: index === 0
          }))
        },
        events: { create: { eventType: 'CREATED', actorUserId: sellerId } }
      },
      select: auctionRowSelect
    });

    return toOwnerAuction(auction);
  }

  async listOwnDrafts(sellerId: string) {
    const drafts = await this.prisma.auction.findMany({
      where: { sellerId, status: 'DRAFT', deletedAt: null },
      select: auctionRowSelect,
      // `id` breaks ties so paging stays stable when timestamps collide
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }]
    });

    return { items: drafts.map(toOwnerAuction) };
  }

  /**
   * AUC-001 — scoping the lookup by sellerId (rather than checking ownership
   * afterwards) is what keeps a draft private: a stranger gets the same 404 as
   * for an id that does not exist, so the response never confirms it is there.
   */
  async findOwnDraft(id: string, sellerId: string) {
    const auction = await this.prisma.auction.findFirst({
      where: { id, sellerId, status: 'DRAFT', deletedAt: null },
      select: auctionRowSelect
    });

    if (!auction) throw new NotFoundException('Auction draft not found');

    return toOwnerAuction(auction);
  }

  /**
   * AUC-002 — the pre-publish check. It reports what the draft is still missing
   * instead of throwing, so the seller can see and fix everything at once; the
   * same rules become the hard gate when AUC-004 publishes.
   *
   * Scoped by sellerId for the same reason findOwnDraft is: the checklist would
   * otherwise tell a stranger what a private draft does and does not contain.
   */
  async validateOwnDraft(id: string, sellerId: string) {
    const draft = await this.prisma.auction.findFirst({
      where: { id, sellerId, status: 'DRAFT', deletedAt: null },
      select: auctionPublishGateSelect
    });

    if (!draft) throw new NotFoundException('Auction draft not found');

    const issues = validateDraftForPublish(draft, new Date());

    return { auctionId: draft.id, ready: issues.length === 0, issues };
  }

  /**
   * AUC-004 — the seller sees exactly what a buyer would, built by the same
   * mapper the public paths use, so the preview cannot drift from the real
   * thing. It is a read: the draft keeps its status.
   */
  async previewOwnDraft(id: string, sellerId: string) {
    const draft = await this.prisma.auction.findFirst({
      where: { id, sellerId, status: 'DRAFT', deletedAt: null },
      select: auctionRowSelect
    });

    if (!draft) throw new NotFoundException('Auction draft not found');

    return toPublicAuction(draft);
  }

  /**
   * AUC-004 — publishing a validated draft. The landing status is decided by
   * the schedule: an auction whose start time has arrived opens as ACTIVE,
   * otherwise it waits as SCHEDULED (AUC-005).
   *
   * Everything runs inside one transaction, and the write is guarded on
   * `status: 'DRAFT'` rather than on the row read a moment earlier — two
   * publish clicks racing each other cannot both win, because the second one
   * updates zero rows and is told so.
   */
  async publishDraft(id: string, sellerId: string) {
    return this.prisma.$transaction(async (tx) => {
      const draft = await tx.auction.findFirst({
        where: { id, sellerId, status: 'DRAFT', deletedAt: null },
        select: auctionPublishGateSelect
      });

      if (!draft) throw new NotFoundException('Auction draft not found');

      const now = new Date();
      const issues = validateDraftForPublish(draft, now);

      if (issues.length > 0) {
        throw new BadRequestException({
          message: 'Draft is not ready to publish',
          issues
        });
      }

      // Validation above guarantees the schedule is set, so the non-null
      // assertion here is the validator's guarantee, not an assumption.
      const startsImmediately =
        draft.scheduledStartAt!.getTime() <= now.getTime();

      const { count } = await tx.auction.updateMany({
        where: { id, sellerId, status: 'DRAFT', deletedAt: null },
        data: {
          status: startsImmediately ? 'ACTIVE' : 'SCHEDULED',
          publishedAt: now,
          startedAt: startsImmediately ? now : null,
          rowVersion: { increment: 1 }
        }
      });

      if (count !== 1) {
        throw new ConflictException(
          'The auction changed in the meantime — reload and try again'
        );
      }

      await tx.auctionEvent.createMany({
        data: [
          { auctionId: id, actorUserId: sellerId, eventType: 'PUBLISHED' },
          // An auction that opens straight away has started, and the event log
          // should say so rather than leaving STARTED to be inferred later.
          ...(startsImmediately
            ? [
                {
                  auctionId: id,
                  actorUserId: sellerId,
                  eventType: 'STARTED' as const
                }
              ]
            : [])
        ]
      });

      const published = await tx.auction.findUniqueOrThrow({
        where: { id },
        select: auctionRowSelect
      });

      return toOwnerAuction(published);
    });
  }

  /**
   * AUC-005 — once published, an auction is public to look at: SCHEDULED is as
   * visible as ACTIVE, and only bidding waits for ACTIVE (reported as
   * `biddingOpen`). DRAFT is excluded by listing the statuses that are public
   * rather than by excluding DRAFT, so a status added later is private until
   * somebody decides otherwise.
   *
   * The seller gets their own auction back through the owner mapper, which is
   * the only way they can still see their reserve after publishing — the draft
   * routes stop matching the moment the status changes.
   */
  async findPublicAuction(id: string, viewerId?: string) {
    const publicStatuses = {
      id,
      status: { in: PUBLIC_AUCTION_STATUSES },
      deletedAt: null
    } satisfies Prisma.AuctionWhereInput;

    let auction = await this.prisma.auction.findFirst({
      where: publicStatuses,
      select: auctionRowSelect
    });

    if (!auction) throw new NotFoundException('Auction not found');

    /**
     * AUC-007 — read repair. AuctionLifecycleService is what normally settles
     * auctions, but its pass runs every ten seconds, and in that window a
     * reader would be told an auction is still ACTIVE and open for bids when
     * it is already over. Settling here closes that window, and covers the
     * auction that ends while the API happens to be restarting.
     *
     * The check comes first so the ordinary read — an auction that is
     * scheduled, running, or long finished — costs exactly one query and never
     * opens a transaction. Only an auction that is genuinely due pays for one.
     *
     * Both paths call the same settleAuction, so a reader and the timer cannot
     * reach different verdicts, and the guarded write inside makes it safe for
     * them to arrive together.
     */
    const isDue =
      auction.status === 'ACTIVE' &&
      auction.currentEndAt !== null &&
      auction.currentEndAt.getTime() <= Date.now();

    if (isDue && (await this.settleAuction(id))) {
      auction = await this.prisma.auction.findFirstOrThrow({
        where: publicStatuses,
        select: auctionRowSelect
      });
    }

    return auction.sellerId === viewerId
      ? toOwnerAuction(auction)
      : toPublicAuction(auction);
  }

  /**
   * AUC-008 — the Hot Auctions list: everything currently running, ranked by
   * how much bidding it has attracted. Only ACTIVE auctions appear, so a
   * scheduled one waiting to open is not "hot" yet and a finished one has
   * dropped off.
   *
   * The ordering lives in HOT_AUCTION_ORDER and is not a query parameter —
   * "no special flags or hidden scoring" means a caller cannot ask for a
   * different arrangement, and there is no promotion or weighting to find.
   *
   * Mapped through toPublicAuction, so the reserve stays out of the list the
   * same way it stays out of a single read (AUC-003).
   */
  async listHotAuctions(dto: ListHotAuctionsDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? DEFAULT_HOT_PAGE_SIZE;
    const where: Prisma.AuctionWhereInput = {
      status: 'ACTIVE',
      deletedAt: null
    };

    const [items, total] = await Promise.all([
      this.prisma.auction.findMany({
        where,
        select: auctionRowSelect,
        orderBy: HOT_AUCTION_ORDER,
        skip: (page - 1) * limit,
        take: limit
      }),
      this.prisma.auction.count({ where })
    ]);

    return {
      items: items.map(toPublicAuction),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) }
    };
  }

  /**
   * AUC-007 — decides how an auction ends. The highest valid bid that clears
   * the reserve makes it SOLD and records the winner and the winning price; no
   * bids at all, or a top bid under the reserve, makes it UNSOLD (AUC-003).
   *
   * Nothing happens unless the auction is ACTIVE and its end time has passed,
   * so this is safe to call on any read. It is called from a read precisely
   * because there is no scheduler in the project yet: settling lazily keeps a
   * finished auction from being *reported* as still running, which is the part
   * the acceptance criteria are about. A timer that closes auctions nobody is
   * looking at is a separate piece of work.
   */
  async settleAuction(id: string) {
    const outcome = await this.settleInTransaction(id);

    /**
     * LIV-004 / SRS section 6 — the room hears the result only once it is on
     * record. A result is final in a way a price is not: no later event
     * supersedes it, so announcing one a rollback could take back would leave
     * a screen showing a sale that never happened.
     *
     * A caller that lost the race to settle gets null and announces nothing —
     * whoever won it has already told the room.
     */
    if (outcome) {
      this.gateway.emitToAuction(id, 'auction:ended', outcome.event);
    }

    return outcome && { sold: outcome.sold };
  }

  private settleInTransaction(id: string) {
    return this.prisma.$transaction(async (tx) => {
      const auction = await tx.auction.findFirst({
        where: { id, status: 'ACTIVE', deletedAt: null },
        select: {
          id: true,
          currentEndAt: true,
          reservePrice: true,
          bidCount: true
        }
      });

      // Not running, or still running — either way there is nothing to settle.
      if (!auction?.currentEndAt) return null;
      if (auction.currentEndAt.getTime() > Date.now()) return null;

      const highestBid = await tx.bid.findFirst({
        where: { auctionId: id },
        // The same order the arena names its leader by (LIV-002), so the
        // person shown to be winning is the person who actually wins.
        orderBy: LEADING_BID_ORDER,
        // The bidder's profile rides along so the announcement below can name
        // the winner masked, without a second read after the commit.
        select: { ...settledWinnerSelect, bidderId: true }
      });

      const reserveMet =
        highestBid !== null &&
        calculateReserveMet(highestBid.amount, auction.reservePrice);
      const sold = highestBid !== null && reserveMet;

      const endedAt = new Date();

      const { count } = await tx.auction.updateMany({
        // Guarded on ACTIVE, so two readers arriving at once cannot both settle
        // the same auction and write two ENDED events.
        where: { id, status: 'ACTIVE', deletedAt: null },
        data: {
          status: sold ? 'SOLD' : 'UNSOLD',
          endedAt,
          winnerUserId: sold ? highestBid.bidderId : null,
          winningBidId: sold ? highestBid.id : null,
          soldPrice: sold ? highestBid.amount : null,
          rowVersion: { increment: 1 }
        }
      });

      // The other reader won the race and has already settled it.
      if (count !== 1) return null;

      await tx.auctionEvent.create({
        data: { auctionId: id, eventType: 'ENDED', bidId: highestBid?.id }
      });

      return {
        sold,
        event: toAuctionEndedEvent({
          id,
          sold,
          endedAt,
          bidCount: auction.bidCount,
          winner: highestBid
        })
      };
    });
  }

  /**
   * AUC-006 — a seller may edit their own auction only while it is DRAFT or
   * SCHEDULED, and only while nobody has bid. Once it is ACTIVE the core data
   * is settled: people are bidding against what they were shown, so changing
   * the terms underneath them is not an edit, it is a different auction.
   *
   * A SCHEDULED auction is re-validated after the edit, because it is already
   * public — an edit must not be able to strip a published auction back down
   * to something that would never have passed the AUC-002 gate. A DRAFT has no
   * such duty: half-finished is what a draft is for.
   */
  async updateOwnAuction(id: string, sellerId: string, dto: UpdateAuctionDto) {
    if (dto.categoryId) await this.assertCategoryIsActive(dto.categoryId);

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.auction.findFirst({
        where: { id, sellerId, deletedAt: null },
        select: { status: true, bidCount: true }
      });

      if (!existing) throw new NotFoundException('Auction not found');

      assertAuctionIsEditable(existing);

      const { count } = await tx.auction.updateMany({
        // Guarded on the status and bid count that were just checked, so an
        // auction going live mid-edit loses the race instead of being edited.
        where: {
          id,
          sellerId,
          status: existing.status,
          bidCount: existing.bidCount,
          deletedAt: null
        },
        data: {
          categoryId: dto.categoryId,
          title: dto.title,
          description: dto.description,
          condition: dto.condition,
          startingPrice: dto.startingPrice,
          minBidIncrement: dto.minBidIncrement,
          reservePrice: dto.reservePrice,
          scheduledStartAt: dto.scheduledStartAt,
          originalEndAt: dto.scheduledEndAt,
          currentEndAt: dto.scheduledEndAt,
          rowVersion: { increment: 1 }
        }
      });

      if (count !== 1) {
        throw new ConflictException(
          'The auction changed in the meantime — reload and try again'
        );
      }

      if (dto.imageUrls) {
        await tx.auctionImage.deleteMany({ where: { auctionId: id } });
        await tx.auctionImage.createMany({
          data: dto.imageUrls.map((url, index) => ({
            auctionId: id,
            storageKey: `${sellerId}/${randomUUID()}/${index}`,
            url,
            position: index,
            isPrimary: index === 0
          }))
        });
      }

      if (existing.status === 'SCHEDULED') {
        const gate = await tx.auction.findUniqueOrThrow({
          where: { id },
          select: auctionPublishGateSelect
        });
        const issues = validateDraftForPublish(gate, new Date());

        if (issues.length > 0) {
          // Rolls the whole edit back: a published auction never sits in a
          // state its own publish gate would have refused.
          throw new BadRequestException({
            message: 'Edit would leave the published auction incomplete',
            issues
          });
        }
      }

      const updated = await tx.auction.findUniqueOrThrow({
        where: { id },
        select: auctionRowSelect
      });

      return toOwnerAuction(updated);
    });
  }

  /**
   * AUC-006 — the seller's own cancellation, allowed under the same conditions
   * as an edit. Cancelling an ACTIVE auction, or one with bids, is a
   * moderation action and belongs to an admin (ADM-001).
   */
  async cancelOwnAuction(id: string, sellerId: string, reason?: string) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.auction.findFirst({
        where: { id, sellerId, deletedAt: null },
        select: { status: true, bidCount: true }
      });

      if (!existing) throw new NotFoundException('Auction not found');

      assertAuctionIsCancellable(existing);

      const { count } = await tx.auction.updateMany({
        where: {
          id,
          sellerId,
          status: existing.status,
          bidCount: existing.bidCount,
          deletedAt: null
        },
        data: {
          status: 'CANCELLED',
          cancellationReason: reason,
          endedAt: new Date(),
          rowVersion: { increment: 1 }
        }
      });

      if (count !== 1) {
        throw new ConflictException(
          'The auction changed in the meantime — reload and try again'
        );
      }

      await tx.auctionEvent.create({
        data: { auctionId: id, actorUserId: sellerId, eventType: 'CANCELLED' }
      });

      const cancelled = await tx.auction.findUniqueOrThrow({
        where: { id },
        select: auctionRowSelect
      });

      return toOwnerAuction(cancelled);
    });
  }

  // ADR-0001 — auctions and products draw from the same category set, so an
  // auction may only reference a category an admin has left active.
  private async assertCategoryIsActive(categoryId: string) {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
      select: { isActive: true }
    });

    if (!category) throw new BadRequestException('Category not found');
    if (!category.isActive) {
      throw new BadRequestException('Category is not active');
    }
  }
}
