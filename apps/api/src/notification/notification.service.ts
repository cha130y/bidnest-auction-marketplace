import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import type { NotificationType } from '../../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_PAGE_SIZE = 20;

/**
 * The reference ids ride along so the bell can deep-link straight to whatever
 * the notification is about. Only one of them is set per row.
 */
const notificationSelect = {
  id: true,
  type: true,
  title: true,
  message: true,
  readAt: true,
  createdAt: true,
  orderId: true,
  conversationId: true,
  auctionId: true,
  bidId: true
} satisfies Prisma.NotificationSelect;

/**
 * NOT-005..008 — the read side of the in-app bell. The rows themselves are
 * written by whichever flow raised them (checkout, shipment, chat, and the
 * auction module), so this service never creates anything; it only serves a
 * user their own notifications.
 */
@Injectable()
export class NotificationService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    userId: string,
    options: {
      types?: NotificationType[];
      unreadOnly?: boolean;
      page?: number;
      limit?: number;
    } = {}
  ) {
    const page = options.page ?? 1;
    const limit = options.limit ?? DEFAULT_PAGE_SIZE;

    const where: Prisma.NotificationWhereInput = {
      userId,
      ...(options.types?.length ? { type: { in: options.types } } : {}),
      ...(options.unreadOnly ? { readAt: null } : {})
    };

    const [items, total, unread] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        select: notificationSelect,
        // `id` breaks ties so paging stays stable for same-instant rows
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { userId, readAt: null } })
    ]);

    return {
      items,
      // Counted across everything the user has, not just this page or the
      // current filter, so a filtered tab still shows the real badge number.
      unread,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) }
    };
  }

  async unreadCount(userId: string) {
    const unread = await this.prisma.notification.count({
      where: { userId, readAt: null }
    });

    return { unread };
  }

  async markRead(userId: string, notificationId: string) {
    const existing = await this.prisma.notification.findFirst({
      where: { id: notificationId, userId },
      select: notificationSelect
    });

    // Not-found rather than forbidden: an outsider learns nothing about
    // whether the notification exists (§6).
    if (!existing) {
      throw new NotFoundException('Notification not found');
    }

    // Marking twice keeps the first timestamp — the bell should say when the
    // user actually saw it, not when they last tapped it.
    if (existing.readAt) {
      return existing;
    }

    return this.prisma.notification.update({
      where: { id: notificationId },
      data: { readAt: new Date() },
      select: notificationSelect
    });
  }

  async markAllRead(userId: string) {
    const { count } = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() }
    });

    return { updated: count };
  }
}
