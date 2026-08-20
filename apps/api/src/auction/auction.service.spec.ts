import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuctionService } from './auction.service';
import { CreateAuctionDraftDto } from './dtos/create-auction-draft.dto';

const SELLER_ID = '00000000-0000-4000-8000-000000000002';
const CATEGORY_ID = '00000000-0000-4000-8000-000000000101';
const DRAFT_ID = '00000000-0000-4000-8000-000000000301';

const START_AT = new Date('2026-09-01T10:00:00.000Z');
const END_AT = new Date('2026-09-01T12:00:00.000Z');

const validDto = (): CreateAuctionDraftDto => ({
  title: 'Vintage Seiko 5 Automatic',
  description: 'Serviced last year, original bracelet.',
  categoryId: CATEGORY_ID,
  condition: 'USED',
  startingPrice: 3000,
  minBidIncrement: 100,
  reservePrice: 4500,
  scheduledStartAt: START_AT,
  scheduledEndAt: END_AT,
  imageUrls: [
    'https://placehold.co/600x400?text=Front',
    'https://placehold.co/600x400?text=Back'
  ]
});

/** Shape of the argument AuctionService hands to prisma.auction.create. */
type CreateArgs = {
  data: {
    sellerId: string;
    categoryId: string;
    title: string;
    description: string;
    condition: string;
    status: string;
    startingPrice: number;
    minBidIncrement: number;
    reservePrice?: number;
    scheduledStartAt?: Date;
    originalEndAt?: Date;
    currentEndAt?: Date;
    images: {
      create: {
        storageKey: string;
        url: string;
        position: number;
        isPrimary: boolean;
      }[];
    };
    events: { create: { eventType: string; actorUserId: string } };
  };
};

/** Shape of the `where` clause the owner-scoped reads narrow themselves with. */
type WhereArgs = { where: Record<string, unknown> };

// Money comes back from Prisma as Decimal, and the mapper calls Decimal methods
// on it to compute reserveMet (AUC-003), so the mock has to use real Decimals.
const dec = (value: string | number) => new Prisma.Decimal(value);

const draftRow = (overrides: Record<string, unknown> = {}) => ({
  id: DRAFT_ID,
  sellerId: SELLER_ID,
  categoryId: CATEGORY_ID,
  title: 'Vintage Seiko 5 Automatic',
  description: 'Serviced last year, original bracelet.',
  condition: 'USED',
  status: 'DRAFT',
  currency: 'THB',
  startingPrice: dec(3000),
  minBidIncrement: dec(100),
  reservePrice: dec(4500),
  currentPrice: dec(0),
  bidCount: 0,
  scheduledStartAt: START_AT,
  originalEndAt: END_AT,
  currentEndAt: END_AT,
  publishedAt: null,
  startedAt: null,
  endedAt: null,
  extensionCount: 0,
  createdAt: new Date('2026-08-19T00:00:00.000Z'),
  updatedAt: new Date('2026-08-19T00:00:00.000Z'),
  images: [
    {
      url: 'https://placehold.co/600x400?text=Front',
      position: 0,
      isPrimary: true
    }
  ],
  category: { id: CATEGORY_ID, name: 'Collectibles', slug: 'collectibles' },
  seller: { id: SELLER_ID, profile: { displayName: 'Somchai Shop' } },
  ...overrides
});

describe('AuctionService', () => {
  let service: AuctionService;
  let prisma: {
    auction: {
      create: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
    };
    category: { findUnique: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      auction: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn()
      },
      category: { findUnique: jest.fn() }
    };

    const moduleRef = await Test.createTestingModule({
      providers: [AuctionService, { provide: PrismaService, useValue: prisma }]
    }).compile();

    service = moduleRef.get(AuctionService);
  });

  /** The single create call AuctionService made, typed rather than `any`. */
  const createArgs = (): CreateArgs =>
    (prisma.auction.create.mock.calls as CreateArgs[][])[0][0];

  describe('createDraft (AUC-001)', () => {
    it('stores every field the draft is made of, in DRAFT status', async () => {
      prisma.category.findUnique.mockResolvedValue({ isActive: true });
      prisma.auction.create.mockResolvedValue(draftRow());

      await service.createDraft(SELLER_ID, validDto());

      const { data } = createArgs();
      expect(data).toMatchObject({
        sellerId: SELLER_ID,
        categoryId: CATEGORY_ID,
        title: 'Vintage Seiko 5 Automatic',
        description: 'Serviced last year, original bracelet.',
        condition: 'USED',
        status: 'DRAFT',
        startingPrice: 3000,
        minBidIncrement: 100,
        reservePrice: 4500,
        scheduledStartAt: START_AT
      });
    });

    it('starts both end columns at the drafted end time', async () => {
      prisma.category.findUnique.mockResolvedValue({ isActive: true });
      prisma.auction.create.mockResolvedValue(draftRow());

      await service.createDraft(SELLER_ID, validDto());

      const { data } = createArgs();
      expect(data.originalEndAt).toBe(END_AT);
      expect(data.currentEndAt).toBe(END_AT);
    });

    it('attaches the images in order and marks the first one primary', async () => {
      prisma.category.findUnique.mockResolvedValue({ isActive: true });
      prisma.auction.create.mockResolvedValue(draftRow());

      await service.createDraft(SELLER_ID, validDto());

      const images = createArgs().data.images.create;
      expect(
        images.map(({ url, position, isPrimary }) => ({
          url,
          position,
          isPrimary
        }))
      ).toEqual([
        {
          url: 'https://placehold.co/600x400?text=Front',
          position: 0,
          isPrimary: true
        },
        {
          url: 'https://placehold.co/600x400?text=Back',
          position: 1,
          isPrimary: false
        }
      ]);
      expect(
        images.every((image) => image.storageKey.startsWith(`${SELLER_ID}/`))
      ).toBe(true);
    });

    it('records the CREATED event in the same write as the draft', async () => {
      prisma.category.findUnique.mockResolvedValue({ isActive: true });
      prisma.auction.create.mockResolvedValue(draftRow());

      await service.createDraft(SELLER_ID, validDto());

      const { data } = createArgs();
      expect(data.events.create).toEqual({
        eventType: 'CREATED',
        actorUserId: SELLER_ID
      });
    });

    it('accepts a draft with no reserve and no images yet', async () => {
      prisma.category.findUnique.mockResolvedValue({ isActive: true });
      prisma.auction.create.mockResolvedValue(
        draftRow({ reservePrice: null, images: [] })
      );

      const dto = validDto();
      delete dto.reservePrice;
      delete dto.imageUrls;
      const result = await service.createDraft(SELLER_ID, dto);

      const { data } = createArgs();
      expect(data.reservePrice).toBeUndefined();
      expect(data.images.create).toEqual([]);
      expect(result.reservePrice).toBeNull();
    });

    it('returns the reserve to the seller who owns the draft', async () => {
      prisma.category.findUnique.mockResolvedValue({ isActive: true });
      prisma.auction.create.mockResolvedValue(draftRow());

      const result = await service.createDraft(SELLER_ID, validDto());

      expect(result.reservePrice).toBe('4500');
      expect(result.status).toBe('DRAFT');
    });

    it('rejects a category that is not active (ADR-0001)', async () => {
      prisma.category.findUnique.mockResolvedValue({ isActive: false });

      await expect(
        service.createDraft(SELLER_ID, validDto())
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.auction.create).not.toHaveBeenCalled();
    });

    it('rejects a category that does not exist', async () => {
      prisma.category.findUnique.mockResolvedValue(null);

      await expect(
        service.createDraft(SELLER_ID, validDto())
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.auction.create).not.toHaveBeenCalled();
    });
  });

  describe('draft privacy (AUC-001)', () => {
    it('scopes a draft lookup to its own seller', async () => {
      prisma.auction.findFirst.mockResolvedValue(draftRow());

      await service.findOwnDraft(DRAFT_ID, SELLER_ID);

      const args = (prisma.auction.findFirst.mock.calls as WhereArgs[][])[0][0];
      expect(args.where).toMatchObject({
        id: DRAFT_ID,
        sellerId: SELLER_ID,
        status: 'DRAFT'
      });
    });

    it('hides a draft that belongs to somebody else behind a 404', async () => {
      prisma.auction.findFirst.mockResolvedValue(null);

      await expect(
        service.findOwnDraft(DRAFT_ID, 'another-seller')
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('lists only the drafts of the seller who asked', async () => {
      prisma.auction.findMany.mockResolvedValue([draftRow()]);

      const result = await service.listOwnDrafts(SELLER_ID);

      const args = (prisma.auction.findMany.mock.calls as WhereArgs[][])[0][0];
      expect(args.where).toMatchObject({
        sellerId: SELLER_ID,
        status: 'DRAFT',
        deletedAt: null
      });
      expect(result.items).toHaveLength(1);
    });
  });

  describe('validateOwnDraft (AUC-002)', () => {
    /** A row shaped like auctionPublishGateSelect, with real Decimals. */
    const gateRow = (overrides: Record<string, unknown> = {}) => ({
      id: DRAFT_ID,
      title: 'Vintage Seiko 5 Automatic',
      description: 'Serviced last year, original bracelet.',
      condition: 'USED',
      startingPrice: new Prisma.Decimal(3000),
      minBidIncrement: new Prisma.Decimal(100),
      reservePrice: new Prisma.Decimal(4500),
      scheduledStartAt: START_AT,
      originalEndAt: END_AT,
      category: { isActive: true },
      images: [{ id: 'image-1' }],
      ...overrides
    });

    it('reports a complete draft as ready with no issues', async () => {
      prisma.auction.findFirst.mockResolvedValue(gateRow());

      const result = await service.validateOwnDraft(DRAFT_ID, SELLER_ID);

      expect(result).toEqual({
        auctionId: DRAFT_ID,
        ready: true,
        issues: []
      });
    });

    it('reports an unfinished draft as not ready and lists what is missing', async () => {
      prisma.auction.findFirst.mockResolvedValue(
        gateRow({ scheduledStartAt: null, originalEndAt: null, images: [] })
      );

      const result = await service.validateOwnDraft(DRAFT_ID, SELLER_ID);

      expect(result.ready).toBe(false);
      expect(result.issues.map((issue) => issue.code)).toEqual(
        expect.arrayContaining([
          'START_AT_REQUIRED',
          'END_AT_REQUIRED',
          'IMAGES_REQUIRED'
        ])
      );
    });

    it('scopes the check to the seller who owns the draft', async () => {
      prisma.auction.findFirst.mockResolvedValue(gateRow());

      await service.validateOwnDraft(DRAFT_ID, SELLER_ID);

      const args = (prisma.auction.findFirst.mock.calls as WhereArgs[][])[0][0];
      expect(args.where).toMatchObject({
        id: DRAFT_ID,
        sellerId: SELLER_ID,
        status: 'DRAFT',
        deletedAt: null
      });
    });

    it('hides a draft owned by somebody else behind the same 404', async () => {
      prisma.auction.findFirst.mockResolvedValue(null);

      await expect(
        service.validateOwnDraft(DRAFT_ID, 'another-seller')
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('never reads the reserve into the response (AUC-003)', async () => {
      prisma.auction.findFirst.mockResolvedValue(gateRow());

      const result = await service.validateOwnDraft(DRAFT_ID, SELLER_ID);

      expect(JSON.stringify(result)).not.toContain('4500');
    });
  });
});
