import {
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';

const DEFAULT_PAGE_SIZE = 50;

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService
  ) {}

  /**
   * CHAT-001 — one thread per (product, buyer, seller). Reopening the chat for
   * the same listing always lands back in the existing thread.
   */
  async openConversation(productId: string, buyerId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, sellerId: true, status: true }
    });

    if (!product || product.status === 'REMOVED') {
      throw new NotFoundException('Product not found');
    }

    if (product.sellerId === buyerId) {
      throw new ForbiddenException(
        'You cannot start a conversation about your own listing'
      );
    }

    const conversation = await this.prisma.conversation.upsert({
      where: {
        productId_buyerId_sellerId: {
          productId,
          buyerId,
          sellerId: product.sellerId
        }
      },
      create: { productId, buyerId, sellerId: product.sellerId },
      update: {},
      select: {
        id: true,
        productId: true,
        buyerId: true,
        sellerId: true,
        createdAt: true
      }
    });

    return conversation;
  }

  /** CHAT-003 — every thread the user is in, buying and selling combined. */
  async listConversations(userId: string) {
    const conversations = await this.prisma.conversation.findMany({
      where: { OR: [{ buyerId: userId }, { sellerId: userId }] },
      select: {
        id: true,
        createdAt: true,
        product: {
          select: {
            id: true,
            title: true,
            images: {
              select: { url: true },
              where: { isPrimary: true },
              take: 1
            }
          }
        },
        buyer: {
          select: { id: true, profile: { select: { displayName: true } } }
        },
        seller: {
          select: { id: true, profile: { select: { displayName: true } } }
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { body: true, senderId: true, createdAt: true }
        },
        _count: {
          select: {
            messages: { where: { senderId: { not: userId }, readAt: null } }
          }
        }
      }
    });

    return conversations
      .map((conversation) => {
        const iAmBuyer = conversation.buyer.id === userId;
        const counterpart = iAmBuyer ? conversation.seller : conversation.buyer;
        const lastMessage = conversation.messages[0] ?? null;

        return {
          id: conversation.id,
          role: iAmBuyer ? ('BUYER' as const) : ('SELLER' as const),
          product: {
            id: conversation.product.id,
            title: conversation.product.title,
            imageUrl: conversation.product.images[0]?.url ?? null
          },
          counterpart: {
            id: counterpart.id,
            displayName: counterpart.profile?.displayName ?? null
          },
          lastMessage: lastMessage
            ? {
                body: lastMessage.body,
                sentByMe: lastMessage.senderId === userId,
                at: lastMessage.createdAt
              }
            : null,
          unreadCount: conversation._count.messages,
          updatedAt: lastMessage?.createdAt ?? conversation.createdAt
        };
      })
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  /** CHAT-002 — read the thread; marks the counterpart's messages as read. */
  async listMessages(
    conversationId: string,
    userId: string,
    page = 1,
    limit = DEFAULT_PAGE_SIZE
  ) {
    await this.assertParticipant(conversationId, userId);

    const [messages, total] = await Promise.all([
      this.prisma.message.findMany({
        where: { conversationId },
        // `id` breaks ties so paging stays stable for same-instant messages
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          senderId: true,
          body: true,
          createdAt: true,
          readAt: true
        }
      }),
      this.prisma.message.count({ where: { conversationId } })
    ]);

    // Only the messages on this page are receipted — fetching page 1 of a long
    // thread must not mark messages the reader never saw.
    const unreadOnThisPage = messages
      .filter((message) => message.senderId !== userId && !message.readAt)
      .map((message) => message.id);

    if (unreadOnThisPage.length > 0) {
      await this.prisma.message.updateMany({
        where: { id: { in: unreadOnThisPage } },
        data: { readAt: new Date() }
      });
    }

    return {
      items: messages.map((message) => ({
        id: message.id,
        body: message.body,
        sentByMe: message.senderId === userId,
        createdAt: message.createdAt,
        readAt: message.readAt
      })),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) }
    };
  }

  /** CHAT-002 + NOT-008 — deliver the message and tell the other party. */
  async sendMessage(conversationId: string, senderId: string, body: string) {
    const conversation = await this.assertParticipant(conversationId, senderId);
    const recipientId =
      conversation.buyerId === senderId
        ? conversation.sellerId
        : conversation.buyerId;

    const message = await this.prisma.$transaction(async (tx) => {
      const created = await tx.message.create({
        data: { conversationId, senderId, body },
        select: { id: true, body: true, createdAt: true }
      });

      await tx.notification.create({
        data: {
          userId: recipientId,
          conversationId,
          type: 'NEW_MESSAGE',
          title: 'New message',
          message: body.length > 120 ? `${body.slice(0, 117)}...` : body
        }
      });

      return created;
    });

    // Emitted after commit, into the room for this conversation only — the
    // thread stays private to its two participants (SRS 6).
    this.realtime.emitMessageSent(conversationId, {
      messageId: message.id,
      conversationId,
      senderId,
      body: message.body,
      createdAt: message.createdAt
    });
    this.realtime.emitNotificationCreated(recipientId, {
      type: 'NEW_MESSAGE',
      conversationId
    });

    return {
      id: message.id,
      body: message.body,
      sentByMe: true,
      createdAt: message.createdAt,
      readAt: null
    };
  }

  /**
   * Only the buyer and the seller of a thread may touch it — admins included,
   * since V1 has no chat moderation (SRS 6).
   */
  private async assertParticipant(conversationId: string, userId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { id: true, buyerId: true, sellerId: true }
    });

    // Not-found rather than forbidden, so an outsider cannot even confirm the
    // thread exists.
    if (
      !conversation ||
      (conversation.buyerId !== userId && conversation.sellerId !== userId)
    ) {
      throw new NotFoundException('Conversation not found');
    }

    return conversation;
  }
}
