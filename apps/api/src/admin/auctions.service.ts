import {
  BadRequestException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import type { AuctionStatus } from '../../generated/prisma/enums';
import { toAuctionCancelledEvent } from '../auction/auction-cancelled-event.mapper';
import { auctionCancelledNotification } from '../auction/auction-notification.mapper';
import { auctionRowSelect, toPublicAuction } from '../auction/auction.mapper';
import { findAuctionAudience } from '../auction/utils/find-auction-audience.util';
import { PrismaService } from '../prisma/prisma.service';
import { AuctionGateway } from '../realtime/auction.gateway';
import { RealtimeService } from '../realtime/realtime.service';
import { ListAdminAuctionsDto } from './dtos/list-admin-auctions.dto';

/** Matches the hot list and the product catalogue, so all three page alike. */
const DEFAULT_ADMIN_PAGE_SIZE = 20;

/**
 * ADM-001 — the statuses an admin may still call off.
 *
 * Wider than a seller's own cancellation (AUC-006), which stops at SCHEDULED:
 * an inappropriate auction that is already running is exactly the case this
 * requirement exists for, and waiting for it to finish is not moderation.
 *
 * It stops where V1 stops. The team's scope for this version ends when an
 * auction concludes — refunds and unwinding a completed sale are not part of
 * it — so SOLD and UNSOLD are terminal here by decision, not by oversight. An
 * endpoint that appeared to reverse a sale while nothing existed to reverse
 * the payment would be worse than not having one.
 */
const CANCELLABLE_BY_ADMIN: AuctionStatus[] = ['DRAFT', 'SCHEDULED', 'ACTIVE'];

/**
 * ADM-001 — Auction oversight (owner: Dev 4)
 *
 * Everything a cancellation touches happens in one transaction: the auction's
 * status, the event log, the admin action (ADM-004) and everybody's
 * notifications (NOT-004). A cancellation that is on record therefore always
 * has its audit row and its notifications on record too — the audit log cannot
 * end up missing the one action somebody later asks about.
 *
 * Announcing comes after the commit (SRS section 6).
 */
@Injectable()
export class AdminAuctionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: AuctionGateway,
    private readonly realtime: RealtimeService
  ) {}

  /**
   * ADM-001 — oversight needs to be able to find the auction before it can act
   * on it, and an admin sees every status, drafts included: a listing is
   * reported before it is published as often as after.
   *
   * Mapped through toPublicAuction, so the reserve stays out of this list too.
   * SRS section 6 forbids disclosing it without carving out admins, and
   * deciding whether an auction is inappropriate never needs the number the
   * seller would have accepted.
   */
  async listAuctions(dto: ListAdminAuctionsDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? DEFAULT_ADMIN_PAGE_SIZE;

    const where: Prisma.AuctionWhereInput = {
      deletedAt: null,
      ...(dto.status ? { status: dto.status } : {})
    };

    const [items, total] = await Promise.all([
      this.prisma.auction.findMany({
        where,
        select: auctionRowSelect,
        // Newest first — moderation follows what has just appeared. `id`
        // breaks ties so paging stays stable when timestamps collide.
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
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
   * ADM-001 — calls off an auction that should not be running, on the record
   * and with a reason.
   */
  async cancelAuction(auctionId: string, adminId: string, reason: string) {
    const { auction, event, notifications } = await this.cancelInTransaction(
      auctionId,
      adminId,
      reason
    );

    // SRS section 6 — the room and the people are told only once it is on
    // record. An auction announced as cancelled that a rollback brought back
    // would leave bidders staring at a dead screen.
    this.gateway.emitToAuction(auctionId, 'auction:cancelled', event);

    for (const notification of notifications) {
      this.realtime.emitNotificationCreated(notification.userId, notification);
    }

    return auction;
  }

  private cancelInTransaction(
    auctionId: string,
    adminId: string,
    reason: string
  ) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.auction.findFirst({
        where: { id: auctionId, deletedAt: null },
        select: { id: true, status: true, sellerId: true }
      });

      if (!existing) throw new NotFoundException('Auction not found');

      if (!CANCELLABLE_BY_ADMIN.includes(existing.status)) {
        throw new BadRequestException(
          `An auction that is ${existing.status} can no longer be cancelled`
        );
      }

      const { count } = await tx.auction.updateMany({
        // Guarded on the status just read, so a seller cancelling or an
        // auction settling in the same moment wins or loses cleanly rather
        // than both writes landing.
        where: { id: auctionId, status: existing.status, deletedAt: null },
        data: {
          status: 'CANCELLED',
          cancellationReason: reason,
          endedAt: new Date(),
          rowVersion: { increment: 1 }
        }
      });

      if (count !== 1) {
        throw new BadRequestException(
          'The auction changed in the meantime — reload and try again'
        );
      }

      await tx.auctionEvent.create({
        data: {
          auctionId,
          actorUserId: adminId,
          eventType: 'CANCELLED'
        }
      });

      /**
       * ADM-004 — in the same transaction as the write it describes. An audit
       * log that can be missing the row for an action that happened is not an
       * audit log.
       */
      await tx.adminAction.create({
        data: {
          adminUserId: adminId,
          auctionId,
          actionType: 'CANCEL_AUCTION',
          note: reason
        }
      });

      const cancelled = await tx.auction.findUniqueOrThrow({
        where: { id: auctionId },
        select: auctionRowSelect
      });

      /**
       * NOT-004 — everybody who bid on it or was watching hears, and so does
       * the seller: unlike their own cancellation, this one was not their
       * decision and they are the person most owed an explanation.
       */
      const audience = await findAuctionAudience(tx, auctionId, [adminId]);
      const recipients = [...new Set([...audience, existing.sellerId])].filter(
        (userId) => userId !== adminId
      );

      const notifications = recipients.map((userId) =>
        auctionCancelledNotification(cancelled, userId, reason)
      );

      await tx.notification.createMany({ data: notifications });

      return {
        auction: toPublicAuction(cancelled),
        event: toAuctionCancelledEvent(cancelled),
        notifications
      };
    });
  }
}
