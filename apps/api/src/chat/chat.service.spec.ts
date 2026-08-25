import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { ChatService } from './chat.service';

describe('ChatService', () => {
  const PRODUCT_ID = '11111111-1111-4111-8111-111111111111';
  const AUCTION_ID = '22222222-2222-4222-8222-222222222222';
  const BUYER_ID = '33333333-3333-4333-8333-333333333333';
  const SELLER_ID = '44444444-4444-4444-8444-444444444444';
  const CONVERSATION_ID = '55555555-5555-4555-8555-555555555555';

  let service: ChatService;
  let prisma: {
    product: { findUnique: jest.Mock };
    auction: { findFirst: jest.Mock };
    conversation: {
      upsert: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
    };
    user: { findUnique: jest.Mock; update: jest.Mock };
    message: { create: jest.Mock };
    $transaction: jest.Mock;
  };
  let realtime: {
    emitMessageSent: jest.Mock;
    emitNotificationCreated: jest.Mock;
  };

  const conversationRow = (
    overrides: Partial<Record<string, unknown>> = {}
  ) => ({
    id: CONVERSATION_ID,
    productId: PRODUCT_ID,
    auctionId: null,
    buyerId: BUYER_ID,
    sellerId: SELLER_ID,
    createdAt: new Date(),
    ...overrides
  });

  beforeEach(async () => {
    prisma = {
      product: { findUnique: jest.fn() },
      auction: { findFirst: jest.fn() },
      conversation: {
        upsert: jest.fn().mockResolvedValue(conversationRow()),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(conversationRow())
      },
      user: { findUnique: jest.fn(), update: jest.fn().mockResolvedValue({}) },
      message: {
        create: jest
          .fn()
          .mockResolvedValue({ id: 'msg-1', body: 'hi', createdAt: new Date() })
      },
      $transaction: jest.fn((fn: (tx: unknown) => unknown) =>
        fn({
          message: prisma.message,
          notification: { create: jest.fn().mockResolvedValue({}) }
        })
      )
    };
    realtime = {
      emitMessageSent: jest.fn(),
      emitNotificationCreated: jest.fn()
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: PrismaService, useValue: prisma },
        { provide: RealtimeService, useValue: realtime }
      ]
    }).compile();

    service = moduleRef.get(ChatService);
  });

  describe('auto-reply setting', () => {
    it('reads null when nothing is configured', async () => {
      prisma.user.findUnique.mockResolvedValue({ autoReplyMessage: null });

      await expect(service.getAutoReplyMessage(SELLER_ID)).resolves.toBeNull();
    });

    it('stores a trimmed message', async () => {
      const result = await service.setAutoReplyMessage(
        SELLER_ID,
        '  ขอบคุณครับ  '
      );

      expect(result).toBe('ขอบคุณครับ');
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: SELLER_ID },
        data: { autoReplyMessage: 'ขอบคุณครับ' }
      });
    });

    it('clears the setting on an empty or whitespace-only message', async () => {
      const result = await service.setAutoReplyMessage(SELLER_ID, '   ');

      expect(result).toBeNull();
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: SELLER_ID },
        data: { autoReplyMessage: null }
      });
    });
  });

  describe('openProductConversation', () => {
    it('opens a thread with the listing’s seller', async () => {
      prisma.product.findUnique.mockResolvedValue({
        id: PRODUCT_ID,
        sellerId: SELLER_ID,
        status: 'ACTIVE'
      });

      await service.openProductConversation(PRODUCT_ID, BUYER_ID);

      expect(prisma.conversation.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: {
            productId: PRODUCT_ID,
            buyerId: BUYER_ID,
            sellerId: SELLER_ID
          }
        })
      );
    });

    it('refuses a seller messaging about their own listing', async () => {
      prisma.product.findUnique.mockResolvedValue({
        id: PRODUCT_ID,
        sellerId: BUYER_ID,
        status: 'ACTIVE'
      });

      await expect(
        service.openProductConversation(PRODUCT_ID, BUYER_ID)
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('404s on a removed product', async () => {
      prisma.product.findUnique.mockResolvedValue({
        id: PRODUCT_ID,
        sellerId: SELLER_ID,
        status: 'REMOVED'
      });

      await expect(
        service.openProductConversation(PRODUCT_ID, BUYER_ID)
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('openAuctionConversation', () => {
    it('opens a thread for a publicly-visible auction', async () => {
      prisma.auction.findFirst.mockResolvedValue({
        id: AUCTION_ID,
        sellerId: SELLER_ID
      });

      await service.openAuctionConversation(AUCTION_ID, BUYER_ID);

      expect(prisma.conversation.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: {
            auctionId: AUCTION_ID,
            buyerId: BUYER_ID,
            sellerId: SELLER_ID
          }
        })
      );
      // Only ever asks about statuses a buyer may see (AUC-005) — a draft
      // auction is filtered out by the query, not by a check afterwards.
      const call = prisma.auction.findFirst.mock.calls[0] as [
        { where: { id: string; status: { in: string[] } } }
      ];
      expect(call[0].where).toEqual(
        expect.objectContaining({
          id: AUCTION_ID,
          status: { in: ['SCHEDULED', 'ACTIVE', 'SOLD', 'UNSOLD'] }
        })
      );
    });

    it('refuses a seller messaging about their own auction', async () => {
      prisma.auction.findFirst.mockResolvedValue({
        id: AUCTION_ID,
        sellerId: BUYER_ID
      });

      await expect(
        service.openAuctionConversation(AUCTION_ID, BUYER_ID)
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('404s on a draft or deleted auction (excluded by the query)', async () => {
      prisma.auction.findFirst.mockResolvedValue(null);

      await expect(
        service.openAuctionConversation(AUCTION_ID, BUYER_ID)
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('listConversations', () => {
    it('reads a product-backed thread as a PRODUCT listing', async () => {
      prisma.conversation.findMany.mockResolvedValue([
        {
          id: CONVERSATION_ID,
          createdAt: new Date('2026-01-01'),
          product: {
            id: PRODUCT_ID,
            title: 'Keyboard',
            images: [{ url: 'x.jpg' }]
          },
          auction: null,
          buyer: { id: BUYER_ID, profile: { displayName: 'Buyer' } },
          seller: { id: SELLER_ID, profile: { displayName: 'Seller' } },
          messages: [],
          _count: { messages: 0 }
        }
      ]);

      const [row] = await service.listConversations(BUYER_ID);

      expect(row.listing).toEqual({
        kind: 'PRODUCT',
        id: PRODUCT_ID,
        title: 'Keyboard',
        imageUrl: 'x.jpg'
      });
      expect(row.role).toBe('BUYER');
    });

    it('reads an auction-backed thread as an AUCTION listing', async () => {
      prisma.conversation.findMany.mockResolvedValue([
        {
          id: CONVERSATION_ID,
          createdAt: new Date('2026-01-01'),
          product: null,
          auction: { id: AUCTION_ID, title: 'Watch', images: [] },
          buyer: { id: BUYER_ID, profile: { displayName: 'Buyer' } },
          seller: { id: SELLER_ID, profile: { displayName: 'Seller' } },
          messages: [],
          _count: { messages: 0 }
        }
      ]);

      const [row] = await service.listConversations(SELLER_ID);

      expect(row.listing).toEqual({
        kind: 'AUCTION',
        id: AUCTION_ID,
        title: 'Watch',
        imageUrl: null
      });
      expect(row.role).toBe('SELLER');
    });
  });

  describe('sendPurchaseAutoReply', () => {
    it('does nothing when the seller has no auto-reply configured', async () => {
      prisma.user.findUnique.mockResolvedValue({ autoReplyMessage: null });

      await service.sendPurchaseAutoReply(SELLER_ID, BUYER_ID, PRODUCT_ID);

      expect(prisma.conversation.upsert).not.toHaveBeenCalled();
    });

    it('opens the thread and sends the seller’s configured message', async () => {
      prisma.user.findUnique.mockResolvedValue({
        autoReplyMessage: 'ขอบคุณที่อุดหนุนครับ'
      });
      prisma.product.findUnique.mockResolvedValue({
        id: PRODUCT_ID,
        sellerId: SELLER_ID,
        status: 'ACTIVE'
      });

      await service.sendPurchaseAutoReply(SELLER_ID, BUYER_ID, PRODUCT_ID);

      const call = prisma.message.create.mock.calls[0] as [
        { data: { conversationId: string; senderId: string; body: string } }
      ];
      expect(call[0].data).toEqual({
        conversationId: CONVERSATION_ID,
        senderId: SELLER_ID,
        body: 'ขอบคุณที่อุดหนุนครับ'
      });
    });

    // Runs after checkout has already committed — a courtesy message
    // failing must never read back to the buyer as their payment failing.
    it('swallows an error instead of throwing', async () => {
      prisma.user.findUnique.mockRejectedValue(new Error('db is down'));

      await expect(
        service.sendPurchaseAutoReply(SELLER_ID, BUYER_ID, PRODUCT_ID)
      ).resolves.toBeUndefined();
    });
  });
});
