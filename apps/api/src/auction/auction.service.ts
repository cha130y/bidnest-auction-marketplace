import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '../../generated/prisma/client';
import { LEADING_BID_ORDER } from '../bid/constants/leading-bid-order.constant';
import { PrismaService } from '../prisma/prisma.service';
import { AuctionGateway } from '../realtime/auction.gateway';
import { RealtimeService } from '../realtime/realtime.service';
import { toAuctionCancelledEvent } from './auction-cancelled-event.mapper';
import {
  auctionCancelledNotification,
  auctionEndedNotification,
  auctionWonNotification
} from './auction-notification.mapper';
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
import {
  AUCTION_SECTION_QUERIES,
  DEFAULT_AUCTION_SECTION
} from './constants/auction-section.constant';
import { MAX_AUCTION_IMAGES } from './constants/auction-image.constant';
import { StorageService, type StoredImage } from '../storage/storage.service';
import { PUBLIC_AUCTION_STATUSES } from './constants/public-auction-status.constant';
import { escapeLike } from '../product/utils/escape-like.util';
import { CreateAuctionDraftDto } from './dtos/create-auction-draft.dto';
import { ListAuctionsDto } from './dtos/list-auctions.dto';
import { ListOwnAuctionsDto } from './dtos/list-own-auctions.dto';
import { UpdateAuctionDto } from './dtos/update-auction.dto';
import {
  assertAuctionIsCancellable,
  assertAuctionIsEditable
} from './utils/assert-seller-can-change.util';
import { calculateReserveMet } from './utils/calculate-reserve-met.util';
import { findAuctionAudience } from './utils/find-auction-audience.util';
import { validateDraftForPublish } from './utils/validate-draft-for-publish.util';

/** Matches the product catalogue, so both lists page the same way. */
const DEFAULT_LIST_PAGE_SIZE = 20;

@Injectable()
export class AuctionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: AuctionGateway,
    private readonly realtime: RealtimeService,
    private readonly storage: StorageService
  ) {}

  private readonly logger = new Logger(AuctionService.name);

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
   * AUC-006 — everything this seller has, in any state.
   *
   * The wider view that `listOwnDrafts` above is not: that one answers "what
   * have I still to finish", this one answers "what have I got". A published
   * auction disappears from the drafts list by design, and before this there
   * was nowhere it reappeared — the seller could only find it by going to the
   * public listing and hunting for their own row.
   *
   * `toOwnerAuction`, so the seller sees their own reserve (AUC-003). Scoped
   * by sellerId in the query rather than filtered afterwards, for the same
   * reason `findOwnDraft` is: ownership decides what the database returns, not
   * what this method chooses to hand back.
   */
  async listOwnAuctions(sellerId: string, dto: ListOwnAuctionsDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? DEFAULT_LIST_PAGE_SIZE;

    const where: Prisma.AuctionWhereInput = {
      sellerId,
      deletedAt: null,
      ...(dto.status ? { status: dto.status } : {})
    };

    const [items, total] = await Promise.all([
      this.prisma.auction.findMany({
        where,
        select: auctionRowSelect,
        // Most recently touched first: the seller's own list is a workbench,
        // and what they changed last is what they are most likely back for.
        // `id` breaks ties so paging stays stable when timestamps collide.
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit
      }),
      this.prisma.auction.count({ where })
    ]);

    return {
      items: items.map(toOwnerAuction),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) }
    };
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
   * AUC-008 — the auction list. Asking for nothing is the Hot Auctions list:
   * everything currently running, ranked by how much bidding it has
   * attracted, so a scheduled auction waiting to open is not "hot" yet and a
   * finished one has dropped off.
   *
   * A `section` picks a different arrangement of what a buyer may already
   * see — ending soon, starting soon, recently ended — for the four cards on
   * the home page. Each section's filter and ordering are fixed in
   * AUCTION_SECTION_QUERIES, so naming a section is the only choice on
   * offer: there is still no `sort` or `status` to reach for, which is what
   * keeps "no special flags or hidden scoring" true of the endpoint as a
   * whole rather than only of its default.
   *
   * Mapped through toPublicAuction, so the reserve stays out of every
   * section the same way it stays out of a single read (AUC-003).
   */
  async listAuctions(dto: ListAuctionsDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? DEFAULT_LIST_PAGE_SIZE;
    const section = dto.section ?? DEFAULT_AUCTION_SECTION;
    const { where: sectionWhere, orderBy } = AUCTION_SECTION_QUERIES[section];

    // Mirrors ProductService.search, so a shopper who mistypes a range is told
    // the same thing on either list rather than silently getting nothing.
    if (
      dto.minPrice !== undefined &&
      dto.maxPrice !== undefined &&
      dto.minPrice > dto.maxPrice
    ) {
      throw new BadRequestException('minPrice cannot be greater than maxPrice');
    }

    /**
     * Collected into one `AND` rather than spread as sibling keys, because
     * both of these are themselves an `OR`: written as two `OR` keys the
     * second would replace the first, and a search plus a price range would
     * quietly become a price range alone.
     *
     * Left out altogether when neither was asked for, rather than sent as an
     * empty `AND: []`. Prisma answers both the same, but the query a section
     * runs unfiltered should stay exactly the query it was — the tests that
     * pin each section down compare the whole `where`, and an empty array in
     * it is a difference they would have to be taught to ignore.
     */
    const narrowing = [
      ...(dto.q ? [searchClause(dto.q)] : []),
      ...(dto.minPrice !== undefined || dto.maxPrice !== undefined
        ? [priceClause(dto.minPrice, dto.maxPrice)]
        : [])
    ];

    // AUC-008 — every filter narrows what the section already chose; none of
    // them can reach past it. `deletedAt` is applied here rather than in each
    // section so a section added later cannot forget it and start listing
    // auctions an admin has removed.
    const where: Prisma.AuctionWhereInput = {
      ...sectionWhere,
      deletedAt: null,
      ...(dto.categoryIds?.length
        ? { categoryId: { in: dto.categoryIds } }
        : {}),
      ...(narrowing.length ? { AND: narrowing } : {})
    };

    const [items, total] = await Promise.all([
      this.prisma.auction.findMany({
        where,
        select: auctionRowSelect,
        orderBy,
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
   * The three numbers the home page puts under its hero: what is running, how
   * much bidding has happened, and the last thing that actually sold.
   *
   * A route of its own rather than something the frontend assembles from the
   * list endpoint. `listAuctions` caps `limit` at 100, so a total across every
   * auction would mean paging through all of them on every visit to the home
   * page — and the moment the finished ones pass a hundred, a frontend adding
   * up one page would quietly start reporting a number that is too low. These
   * are three counts the database answers directly.
   *
   * `deletedAt: null` throughout, matching the list: an auction an admin has
   * removed is gone from what a visitor is told, and so are its bids.
   *
   * The last sale is the newest SOLD auction by `endedAt` — when settlement
   * recorded the outcome (AUC-007), the same field `recently-ended` sorts on.
   * `id` breaks a tie so two auctions settled in the same instant cannot swap
   * places between reads. Null until somebody sells something, which the
   * caller has to handle: on a fresh deployment that is the normal state, not
   * an error.
   *
   * `soldPrice` rather than `currentPrice`: what somebody paid, not where the
   * bidding got to. The reserve is not read here at all, so AUC-003 has
   * nothing to leak through this route.
   */
  async getStats() {
    const [activeAuctions, totalBids, lastSale] = await Promise.all([
      this.prisma.auction.count({
        where: { status: 'ACTIVE', deletedAt: null }
      }),
      this.prisma.bid.count({ where: { auction: { deletedAt: null } } }),
      this.prisma.auction.findFirst({
        where: { status: 'SOLD', deletedAt: null, soldPrice: { not: null } },
        orderBy: [{ endedAt: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          title: true,
          soldPrice: true,
          bidCount: true,
          endedAt: true
        }
      })
    ]);

    return {
      activeAuctions,
      totalBids,
      // The `soldPrice` test is what narrows the type, and it holds for the
      // same reason the query filters on it: a SOLD auction without a price
      // is a row nothing in the app produces.
      lastSale: lastSale?.soldPrice
        ? {
            id: lastSale.id,
            title: lastSale.title,
            soldPrice: lastSale.soldPrice.toString(),
            bidCount: lastSale.bidCount,
            endedAt: lastSale.endedAt
          }
        : null
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
      this.deliver(outcome.notifications);
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
          bidCount: true,
          // NOT-002 / NOT-003 — a notification has to name the thing it is
          // about, and reach the seller as well as the bidders.
          title: true,
          currency: true,
          sellerId: true
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

      /**
       * NOT-002 / NOT-003 — raised in the same transaction that settled the
       * auction, so a result on record always has its notifications on record
       * too. A separate write afterwards could fail and leave somebody never
       * told their auction had ended.
       */
      const winnerId = sold ? highestBid.bidderId : null;
      const audience = await findAuctionAudience(tx, id, [winnerId]);

      const notifications = [
        ...(sold
          ? [
              auctionWonNotification(
                auction,
                winnerId!,
                highestBid.id,
                highestBid.amount
              )
            ]
          : []),
        // The seller hears too, and is added here rather than in the audience
        // query because their id is already known.
        ...[...new Set([...audience, auction.sellerId])]
          .filter((userId) => userId !== winnerId)
          .map((userId) =>
            auctionEndedNotification(auction, userId, {
              sold,
              finalPrice: highestBid?.amount ?? null
            })
          )
      ];

      await tx.notification.createMany({ data: notifications });

      return {
        sold,
        notifications,
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
    const { auction, event, notifications } = await this.cancelInTransaction(
      id,
      sellerId,
      reason
    );

    /**
     * NOT-004 / SRS section 6 — told only once the cancellation has committed.
     *
     * The room hears the same `auction:cancelled` an admin cancellation sends
     * (ADM-001). A seller can only call off a DRAFT or a SCHEDULED auction,
     * so nobody is mid-bid — but a lobby full of people waiting for one to
     * start would otherwise count down to an auction that is not coming, and
     * the event has to mean one thing wherever it comes from.
     */
    this.gateway.emitToAuction(id, 'auction:cancelled', event);
    this.deliver(notifications);

    return auction;
  }

  private cancelInTransaction(id: string, sellerId: string, reason?: string) {
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

      /**
       * NOT-004 — everybody who bid on it or was watching hears, because they
       * were waiting on something that is not going to happen now. The seller
       * is excluded: they are the one who just cancelled it.
       */
      const audience = await findAuctionAudience(tx, id, [sellerId]);
      const notifications = audience.map((userId) =>
        auctionCancelledNotification(cancelled, userId, reason)
      );

      await tx.notification.createMany({ data: notifications });

      return {
        auction: toOwnerAuction(cancelled),
        event: toAuctionCancelledEvent(cancelled),
        notifications
      };
    });
  }

  /**
   * NOT-001..004 — hands committed notification rows to the realtime side.
   *
   * Deliberately after the transaction, like every other announcement (SRS
   * section 6), and deliberately not awaited into the caller's result: a bell
   * that fails to light must not undo a settled auction.
   */
  private deliver(notifications: Prisma.NotificationCreateManyInput[]): void {
    for (const notification of notifications) {
      this.realtime.emitNotificationCreated(notification.userId, notification);
    }
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

  /**
   * AUC-001 — puts an uploaded picture on a draft.
   *
   * Only a draft: once an auction is published the pictures buyers have been
   * looking at are part of what they are bidding on, and swapping them is not
   * an edit, it is a different listing.
   *
   * The upload happens outside the transaction because it is a network call to
   * somebody else's service, and holding a database transaction open across it
   * would lock a row for as long as the internet feels like taking. The count
   * is checked twice for the same reason: once to refuse early, once inside
   * the transaction where two uploads racing each other cannot both win.
   *
   * If the row cannot be written after the file is stored, the file is
   * removed. Skipping that leaves an image nothing points at, which nothing
   * will ever clean up because nothing knows it is there.
   */
  async addDraftImage(
    id: string,
    sellerId: string,
    file: { buffer: Buffer },
    altText?: string
  ) {
    const draft = await this.prisma.auction.findFirst({
      where: { id, sellerId, status: 'DRAFT', deletedAt: null },
      select: { id: true, _count: { select: { images: true } } }
    });

    if (!draft) throw new NotFoundException('Auction draft not found');

    if (draft._count.images >= MAX_AUCTION_IMAGES) {
      throw new BadRequestException(
        `An auction can have at most ${MAX_AUCTION_IMAGES} images`
      );
    }

    let stored: StoredImage;
    try {
      stored = await this.storage.uploadAuctionImage(file.buffer, id);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown';
      this.logger.error(`Image upload failed for auction ${id}: ${message}`);
      throw new ServiceUnavailableException(
        'Image upload is temporarily unavailable'
      );
    }

    try {
      const auction = await this.prisma.$transaction(async (tx) => {
        const current = await tx.auction.findFirst({
          where: { id, sellerId, status: 'DRAFT', deletedAt: null },
          select: {
            _count: { select: { images: true } },
            images: {
              select: { position: true },
              orderBy: { position: 'desc' },
              take: 1
            }
          }
        });

        if (!current) throw new NotFoundException('Auction draft not found');

        if (current._count.images >= MAX_AUCTION_IMAGES) {
          throw new BadRequestException(
            `An auction can have at most ${MAX_AUCTION_IMAGES} images`
          );
        }

        // The next free slot, not the count: a removal leaves a gap, and
        // reusing it would collide with @@unique([auctionId, position]).
        const position = (current.images[0]?.position ?? -1) + 1;

        await tx.auctionImage.create({
          data: {
            auctionId: id,
            storageKey: stored.storageKey,
            url: stored.url,
            altText: altText ?? null,
            position,
            // The first picture on an empty draft is the one the cards show.
            isPrimary: current._count.images === 0
          }
        });

        return tx.auction.update({
          where: { id },
          data: { rowVersion: { increment: 1 } },
          select: auctionRowSelect
        });
      });

      return toOwnerAuction(auction);
    } catch (error: unknown) {
      try {
        await this.storage.deleteImage(stored.storageKey);
      } catch (cleanupError: unknown) {
        // Nothing left to tell the caller — they are getting the original
        // failure — so this is logged rather than thrown over the top of it.
        const message =
          cleanupError instanceof Error ? cleanupError.message : 'Unknown';
        this.logger.error(
          `Failed to remove orphaned image ${stored.storageKey}: ${message}`
        );
      }
      throw error;
    }
  }

  /**
   * AUC-001 — takes a picture off a draft.
   *
   * The row goes first and the file second: a file still in the store that no
   * row points at costs money and nothing else, while a row pointing at a file
   * that is gone is a broken picture on somebody's screen.
   *
   * Removing the primary promotes whichever picture is now first, so a draft
   * with images always has one to lead with.
   */
  async removeDraftImage(id: string, sellerId: string, imageId: string) {
    const { auction, storageKey } = await this.prisma.$transaction(
      async (tx) => {
        const image = await tx.auctionImage.findFirst({
          where: {
            id: imageId,
            auction: { id, sellerId, status: 'DRAFT', deletedAt: null }
          },
          select: { id: true, storageKey: true, isPrimary: true }
        });

        if (!image) throw new NotFoundException('Auction image not found');

        await tx.auctionImage.delete({ where: { id: image.id } });

        if (image.isPrimary) {
          const next = await tx.auctionImage.findFirst({
            where: { auctionId: id },
            orderBy: { position: 'asc' },
            select: { id: true }
          });

          if (next) {
            await tx.auctionImage.update({
              where: { id: next.id },
              data: { isPrimary: true }
            });
          }
        }

        const updated = await tx.auction.update({
          where: { id },
          data: { rowVersion: { increment: 1 } },
          select: auctionRowSelect
        });

        return { auction: updated, storageKey: image.storageKey };
      }
    );

    try {
      // A picture added by URL has a storage key nothing was ever filed
      // under, and the store treats "not found" as done — so this is safe for
      // both kinds without having to tell them apart.
      await this.storage.deleteImage(storageKey);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown';
      this.logger.error(`Failed to delete image ${storageKey}: ${message}`);
    }

    return toOwnerAuction(auction);
  }
}

/**
 * AUC-008 — the words somebody typed, against the two fields that carry them.
 *
 * `escapeLike` is imported from the catalogue's utils rather than copied. It
 * is the fix for `%` and `_` being LIKE's own wildcards, and a second copy of
 * that rule is how one of the two ends up not being fixed. If a third module
 * ever needs it, that is the moment to lift it into `common/` — a move that
 * touches Dev 3's imports and should be agreed rather than assumed.
 */
function searchClause(q: string): Prisma.AuctionWhereInput {
  const term = escapeLike(q);

  return {
    OR: [
      { title: { contains: term, mode: 'insensitive' } },
      { description: { contains: term, mode: 'insensitive' } }
    ]
  };
}

/**
 * AUC-008 — a price range, matched against whichever price the auction is
 * actually showing.
 *
 * This is the one filter that could not be copied from the catalogue. A
 * product has one price; an auction has two, and which of them is on the card
 * depends on whether anybody has bid — `currentPrice` starts at 0 and only
 * means anything once `bidCount` is above zero.
 *
 * Filtering on `currentPrice` alone would therefore file every auction nobody
 * has bid on under 0, and drop it from every range that does not start there:
 * an auction opening at ฿3,000 would be missing from a search for ฿1,000 to
 * ฿5,000 while showing ฿3,000 on its own card.
 */
function priceClause(min?: number, max?: number): Prisma.AuctionWhereInput {
  const range = {
    ...(min !== undefined ? { gte: min } : {}),
    ...(max !== undefined ? { lte: max } : {})
  };

  return {
    OR: [
      { bidCount: { gt: 0 }, currentPrice: range },
      { bidCount: 0, startingPrice: range }
    ]
  };
}
