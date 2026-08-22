import {
  BadRequestException,
  ConflictException,
  NotFoundException
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuctionGateway } from '../realtime/auction.gateway';
import { RealtimeService } from '../realtime/realtime.service';
import { AuctionService } from './auction.service';
import {
  AUCTION_SECTIONS,
  AUCTION_SECTION_QUERIES
} from './constants/auction-section.constant';
import { PUBLIC_AUCTION_STATUSES } from './constants/public-auction-status.constant';
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
  soldPrice: null,
  cancellationReason: null,
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
      updateMany: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      findFirstOrThrow: jest.Mock;
      count: jest.Mock;
    };
    auctionEvent: { createMany: jest.Mock; create: jest.Mock };
    auctionImage: { deleteMany: jest.Mock; createMany: jest.Mock };
    bid: { findFirst: jest.Mock; findMany: jest.Mock };
    watchlist: { findMany: jest.Mock };
    notification: { createMany: jest.Mock };
    category: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  let gateway: { emitToAuction: jest.Mock };
  let realtime: { emitNotificationCreated: jest.Mock };

  beforeEach(async () => {
    prisma = {
      auction: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        updateMany: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        findFirstOrThrow: jest.fn(),
        count: jest.fn()
      },
      auctionEvent: { createMany: jest.fn(), create: jest.fn() },
      auctionImage: { deleteMany: jest.fn(), createMany: jest.fn() },
      bid: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      watchlist: { findMany: jest.fn().mockResolvedValue([]) },
      notification: { createMany: jest.fn() },
      category: { findUnique: jest.fn() },
      // Hands the callback the same mock, so assertions can read every call the
      // transaction made without a second layer of fakes.
      $transaction: jest.fn((run: (tx: unknown) => unknown) => run(prisma))
    };
    gateway = { emitToAuction: jest.fn() };
    realtime = { emitNotificationCreated: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuctionService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuctionGateway, useValue: gateway },
        { provide: RealtimeService, useValue: realtime }
      ]
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

  /**
   * AUC-004 — preview shows the buyer's view without touching the draft, and
   * publish moves a validated draft to SCHEDULED or ACTIVE depending on when it
   * is due to start.
   */
  describe('previewOwnDraft (AUC-004)', () => {
    it('returns the buyer-facing shape, without the reserve', async () => {
      prisma.auction.findFirst.mockResolvedValue(draftRow());

      const preview = await service.previewOwnDraft(DRAFT_ID, SELLER_ID);

      expect(preview).not.toHaveProperty('reservePrice');
      expect(preview).toMatchObject({ id: DRAFT_ID, reserveMet: false });
    });

    it('changes nothing — no write of any kind is issued', async () => {
      prisma.auction.findFirst.mockResolvedValue(draftRow());

      await service.previewOwnDraft(DRAFT_ID, SELLER_ID);

      expect(prisma.auction.updateMany).not.toHaveBeenCalled();
      expect(prisma.auction.create).not.toHaveBeenCalled();
      expect(prisma.auctionEvent.createMany).not.toHaveBeenCalled();
    });

    it('scopes the preview to the seller who owns the draft', async () => {
      prisma.auction.findFirst.mockResolvedValue(null);

      await expect(
        service.previewOwnDraft(DRAFT_ID, 'another-seller')
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('publishDraft (AUC-004)', () => {
    /** A gate row whose schedule is relative to the moment of the test run. */
    const gateRow = (overrides: Record<string, unknown> = {}) => ({
      id: DRAFT_ID,
      title: 'Vintage Seiko 5 Automatic',
      description: 'Serviced last year, original bracelet.',
      condition: 'USED',
      startingPrice: dec(3000),
      minBidIncrement: dec(100),
      reservePrice: dec(4500),
      scheduledStartAt: new Date(Date.now() + 60 * 60 * 1000),
      originalEndAt: new Date(Date.now() + 4 * 60 * 60 * 1000),
      category: { isActive: true },
      images: [{ id: 'image-1' }],
      ...overrides
    });

    const publishSucceeds = (row: ReturnType<typeof gateRow>) => {
      prisma.auction.findFirst.mockResolvedValue(row);
      prisma.auction.updateMany.mockResolvedValue({ count: 1 });
      prisma.auctionEvent.createMany.mockResolvedValue({ count: 1 });
      prisma.auction.findUniqueOrThrow.mockResolvedValue(draftRow());
    };

    /** The where/data the publish write actually sent. */
    const updateArgs = () =>
      (
        prisma.auction.updateMany.mock.calls as {
          where: Record<string, unknown>;
          data: Record<string, unknown>;
        }[][]
      )[0][0];

    /** The event rows the publish wrote. */
    const writtenEvents = () =>
      (
        prisma.auctionEvent.createMany.mock.calls as {
          data: { eventType: string }[];
        }[][]
      )[0][0].data;

    /** The BadRequest body a failed publish came back with. */
    const issuesFrom = (error: unknown) =>
      (
        (error as BadRequestException).getResponse() as {
          issues: { code: string }[];
        }
      ).issues.map((issue) => issue.code);

    it('lands a future-dated draft in SCHEDULED, not started yet', async () => {
      publishSucceeds(gateRow());

      await service.publishDraft(DRAFT_ID, SELLER_ID);

      const { data } = updateArgs();
      expect(data.status).toBe('SCHEDULED');
      expect(data.startedAt).toBeNull();
      expect(data.publishedAt).toBeInstanceOf(Date);
    });

    it('opens a draft whose start time has arrived as ACTIVE', async () => {
      publishSucceeds(
        gateRow({ scheduledStartAt: new Date(Date.now() - 60 * 1000) })
      );

      await service.publishDraft(DRAFT_ID, SELLER_ID);

      const { data } = updateArgs();
      expect(data.status).toBe('ACTIVE');
      expect(data.startedAt).toBeInstanceOf(Date);
    });

    it('records PUBLISHED alone when the auction is only scheduled', async () => {
      publishSucceeds(gateRow());

      await service.publishDraft(DRAFT_ID, SELLER_ID);

      expect(writtenEvents().map((event) => event.eventType)).toEqual([
        'PUBLISHED'
      ]);
    });

    it('records PUBLISHED and STARTED when it opens immediately', async () => {
      publishSucceeds(
        gateRow({ scheduledStartAt: new Date(Date.now() - 60 * 1000) })
      );

      await service.publishDraft(DRAFT_ID, SELLER_ID);

      expect(writtenEvents().map((event) => event.eventType)).toEqual([
        'PUBLISHED',
        'STARTED'
      ]);
    });

    it('guards the write on DRAFT so a second click cannot publish twice', async () => {
      publishSucceeds(gateRow());

      await service.publishDraft(DRAFT_ID, SELLER_ID);

      expect(updateArgs().where).toMatchObject({
        id: DRAFT_ID,
        sellerId: SELLER_ID,
        status: 'DRAFT',
        deletedAt: null
      });
    });

    it('reports a conflict when the guarded write matches no row', async () => {
      prisma.auction.findFirst.mockResolvedValue(gateRow());
      prisma.auction.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.publishDraft(DRAFT_ID, SELLER_ID)
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.auctionEvent.createMany).not.toHaveBeenCalled();
    });

    it('does the whole publish inside one transaction', async () => {
      publishSucceeds(gateRow());

      await service.publishDraft(DRAFT_ID, SELLER_ID);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('refuses a draft that fails validation, and writes nothing', async () => {
      prisma.auction.findFirst.mockResolvedValue(gateRow({ images: [] }));

      await expect(
        service.publishDraft(DRAFT_ID, SELLER_ID)
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.auction.updateMany).not.toHaveBeenCalled();
    });

    it('hands back the unmet rules so the seller knows what to fix', async () => {
      prisma.auction.findFirst.mockResolvedValue(gateRow({ images: [] }));

      const error = await service
        .publishDraft(DRAFT_ID, SELLER_ID)
        .catch((caught: unknown) => caught);

      expect(issuesFrom(error)).toContain('IMAGES_REQUIRED');
    });

    it('refuses a draft whose end time has already passed', async () => {
      prisma.auction.findFirst.mockResolvedValue(
        gateRow({
          scheduledStartAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
          originalEndAt: new Date(Date.now() - 60 * 60 * 1000)
        })
      );

      const error = await service
        .publishDraft(DRAFT_ID, SELLER_ID)
        .catch((caught: unknown) => caught);

      expect(issuesFrom(error)).toContain('END_AT_IN_THE_PAST');
      expect(prisma.auction.updateMany).not.toHaveBeenCalled();
    });

    it('hides a draft owned by somebody else behind a 404', async () => {
      prisma.auction.findFirst.mockResolvedValue(null);

      await expect(
        service.publishDraft(DRAFT_ID, 'another-seller')
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  /**
   * AUC-005 — a published auction is public to look at from SCHEDULED onwards;
   * only bidding waits for ACTIVE. A DRAFT is never public.
   */
  describe('findPublicAuction (AUC-005)', () => {
    const publishedRow = (overrides: Record<string, unknown> = {}) =>
      draftRow({ status: 'SCHEDULED', ...overrides });

    /**
     * The `where` the public lookup narrowed itself with — the first read. The
     * AUC-007 read repair only runs afterwards, and only for an auction that is
     * actually due, so an ordinary read makes this one query and no more.
     */
    const lookupWhere = () =>
      (prisma.auction.findFirst.mock.calls as WhereArgs[][])[0][0].where;

    it('shows a SCHEDULED auction to a signed-out visitor', async () => {
      prisma.auction.findFirst.mockResolvedValue(publishedRow());

      const auction = await service.findPublicAuction(DRAFT_ID);

      expect(auction).toMatchObject({ id: DRAFT_ID, status: 'SCHEDULED' });
    });

    it('reports bidding as closed while the auction is only SCHEDULED', async () => {
      prisma.auction.findFirst.mockResolvedValue(publishedRow());

      const auction = await service.findPublicAuction(DRAFT_ID);

      expect(auction.biddingOpen).toBe(false);
    });

    it('reports bidding as open once the auction is ACTIVE', async () => {
      prisma.auction.findFirst.mockResolvedValue(
        publishedRow({ status: 'ACTIVE' })
      );

      const auction = await service.findPublicAuction(DRAFT_ID);

      expect(auction.biddingOpen).toBe(true);
    });

    it('never exposes the reserve to a visitor', async () => {
      prisma.auction.findFirst.mockResolvedValue(publishedRow());

      const auction = await service.findPublicAuction(DRAFT_ID);

      expect(auction).not.toHaveProperty('reservePrice');
      expect(JSON.stringify(auction)).not.toContain('4500');
    });

    it('never exposes the reserve to another signed-in user either', async () => {
      prisma.auction.findFirst.mockResolvedValue(publishedRow());

      const auction = await service.findPublicAuction(DRAFT_ID, 'someone-else');

      expect(auction).not.toHaveProperty('reservePrice');
    });

    // Publishing makes the draft routes stop matching, so this is the only way
    // a seller can still read their own reserve afterwards
    it('gives the seller their own reserve back', async () => {
      prisma.auction.findFirst.mockResolvedValue(publishedRow());

      const auction = await service.findPublicAuction(DRAFT_ID, SELLER_ID);

      expect(auction).toMatchObject({ reservePrice: '4500' });
    });

    it('limits the lookup to statuses that are public, excluding DRAFT', async () => {
      prisma.auction.findFirst.mockResolvedValue(publishedRow());

      await service.findPublicAuction(DRAFT_ID);

      expect(lookupWhere()).toMatchObject({
        id: DRAFT_ID,
        status: { in: ['SCHEDULED', 'ACTIVE', 'SOLD', 'UNSOLD'] },
        deletedAt: null
      });
    });

    it('hides an auction that is still a draft behind a 404', async () => {
      // the status filter means the row simply is not found
      prisma.auction.findFirst.mockResolvedValue(null);

      await expect(service.findPublicAuction(DRAFT_ID)).rejects.toBeInstanceOf(
        NotFoundException
      );
    });

    /**
     * AUC-007 read repair — the timer settles auctions every ten seconds, and
     * this closes the window in between. It must not make the ordinary read
     * more expensive, which is what these tests hold in place.
     */
    describe('read repair', () => {
      it('costs one query and no transaction for an auction that is not due', async () => {
        prisma.auction.findFirst.mockResolvedValue(publishedRow());

        await service.findPublicAuction(DRAFT_ID);

        expect(prisma.auction.findFirst).toHaveBeenCalledTimes(1);
        expect(prisma.$transaction).not.toHaveBeenCalled();
      });

      it('does not settle an ACTIVE auction that is still running', async () => {
        prisma.auction.findFirst.mockResolvedValue(
          publishedRow({
            status: 'ACTIVE',
            currentEndAt: new Date(Date.now() + 60 * 60 * 1000)
          })
        );

        await service.findPublicAuction(DRAFT_ID);

        expect(prisma.$transaction).not.toHaveBeenCalled();
      });

      it('settles an ACTIVE auction whose end time has passed, then re-reads it', async () => {
        const due = publishedRow({
          status: 'ACTIVE',
          currentEndAt: new Date(Date.now() - 60 * 1000)
        });
        // first: the public read. second: settleAuction's own ACTIVE lookup.
        prisma.auction.findFirst
          .mockResolvedValueOnce(due)
          .mockResolvedValueOnce({
            id: DRAFT_ID,
            currentEndAt: new Date(Date.now() - 60 * 1000),
            reservePrice: dec(4500)
          });
        prisma.bid.findFirst.mockResolvedValue(null);
        prisma.auction.updateMany.mockResolvedValue({ count: 1 });
        prisma.auctionEvent.create.mockResolvedValue({});
        prisma.auction.findFirstOrThrow.mockResolvedValue(
          publishedRow({ status: 'UNSOLD' })
        );

        const result = await service.findPublicAuction(DRAFT_ID);

        expect(prisma.$transaction).toHaveBeenCalledTimes(1);
        // the caller sees the settled result, not the stale ACTIVE row
        expect(result.status).toBe('UNSOLD');
      });

      it('does not re-read when another reader settled it first', async () => {
        prisma.auction.findFirst
          .mockResolvedValueOnce(
            publishedRow({
              status: 'ACTIVE',
              currentEndAt: new Date(Date.now() - 60 * 1000)
            })
          )
          // settleAuction finds nothing ACTIVE left to settle
          .mockResolvedValueOnce(null);

        await service.findPublicAuction(DRAFT_ID);

        expect(prisma.auction.findFirstOrThrow).not.toHaveBeenCalled();
      });
    });
  });

  /**
   * AUC-006 — a seller edits or cancels only while the auction is DRAFT or
   * SCHEDULED and nobody has bid. The guard rules themselves are covered in
   * assert-seller-can-change.util.spec; these tests cover what the service does
   * around them.
   */
  describe('updateOwnAuction (AUC-006)', () => {
    const editableRow = (overrides: Record<string, unknown> = {}) => ({
      status: 'DRAFT',
      bidCount: 0,
      ...overrides
    });

    const updateSucceeds = (row: ReturnType<typeof editableRow>) => {
      prisma.auction.findFirst.mockResolvedValue(row);
      prisma.auction.updateMany.mockResolvedValue({ count: 1 });
      prisma.auction.findUniqueOrThrow.mockResolvedValue(draftRow());
      prisma.auctionImage.deleteMany.mockResolvedValue({ count: 0 });
      prisma.auctionImage.createMany.mockResolvedValue({ count: 0 });
    };

    const updateArgs = () =>
      (
        prisma.auction.updateMany.mock.calls as {
          where: Record<string, unknown>;
          data: Record<string, unknown>;
        }[][]
      )[0][0];

    it('edits a DRAFT', async () => {
      updateSucceeds(editableRow());

      await service.updateOwnAuction(DRAFT_ID, SELLER_ID, { title: 'Renamed' });

      expect(updateArgs().data).toMatchObject({ title: 'Renamed' });
    });

    it('edits a SCHEDULED auction, re-validating it afterwards', async () => {
      updateSucceeds(editableRow({ status: 'SCHEDULED' }));
      prisma.auction.findUniqueOrThrow
        .mockResolvedValueOnce({
          id: DRAFT_ID,
          title: 'Renamed',
          description: 'still fine',
          condition: 'USED',
          startingPrice: dec(3000),
          minBidIncrement: dec(100),
          reservePrice: dec(4500),
          scheduledStartAt: new Date(Date.now() + 60 * 60 * 1000),
          originalEndAt: new Date(Date.now() + 4 * 60 * 60 * 1000),
          category: { isActive: true },
          images: [{ id: 'image-1' }]
        })
        .mockResolvedValueOnce(draftRow());

      await service.updateOwnAuction(DRAFT_ID, SELLER_ID, { title: 'Renamed' });

      expect(prisma.auction.updateMany).toHaveBeenCalled();
    });

    it('rolls back an edit that would leave a published auction incomplete', async () => {
      updateSucceeds(editableRow({ status: 'SCHEDULED' }));
      // the re-validation read comes back with no images left
      prisma.auction.findUniqueOrThrow.mockResolvedValueOnce({
        id: DRAFT_ID,
        title: 'Renamed',
        description: 'still fine',
        condition: 'USED',
        startingPrice: dec(3000),
        minBidIncrement: dec(100),
        reservePrice: dec(4500),
        scheduledStartAt: new Date(Date.now() + 60 * 60 * 1000),
        originalEndAt: new Date(Date.now() + 4 * 60 * 60 * 1000),
        category: { isActive: true },
        images: []
      });

      await expect(
        service.updateOwnAuction(DRAFT_ID, SELLER_ID, { imageUrls: [] })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('does not re-validate a DRAFT — half-finished is allowed there', async () => {
      updateSucceeds(editableRow());

      await service.updateOwnAuction(DRAFT_ID, SELLER_ID, { imageUrls: [] });

      // one read only: the row that gets mapped back, no gate read
      expect(prisma.auction.findUniqueOrThrow).toHaveBeenCalledTimes(1);
    });

    it('refuses to edit an ACTIVE auction and writes nothing', async () => {
      prisma.auction.findFirst.mockResolvedValue(
        editableRow({ status: 'ACTIVE' })
      );

      await expect(
        service.updateOwnAuction(DRAFT_ID, SELLER_ID, { title: 'Too late' })
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.auction.updateMany).not.toHaveBeenCalled();
    });

    it('refuses to edit an auction that has bids', async () => {
      prisma.auction.findFirst.mockResolvedValue(
        editableRow({ status: 'SCHEDULED', bidCount: 2 })
      );

      await expect(
        service.updateOwnAuction(DRAFT_ID, SELLER_ID, { title: 'Too late' })
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.auction.updateMany).not.toHaveBeenCalled();
    });

    it('replaces the whole image set rather than appending to it', async () => {
      updateSucceeds(editableRow());

      await service.updateOwnAuction(DRAFT_ID, SELLER_ID, {
        imageUrls: ['https://placehold.co/600x400?text=New']
      });

      expect(prisma.auctionImage.deleteMany).toHaveBeenCalledWith({
        where: { auctionId: DRAFT_ID }
      });
      const created = (
        prisma.auctionImage.createMany.mock.calls as {
          data: { url: string; position: number; isPrimary: boolean }[];
        }[][]
      )[0][0].data;
      expect(created).toHaveLength(1);
      expect(created[0]).toMatchObject({ position: 0, isPrimary: true });
    });

    it('leaves the images alone when the edit does not mention them', async () => {
      updateSucceeds(editableRow());

      await service.updateOwnAuction(DRAFT_ID, SELLER_ID, { title: 'Renamed' });

      expect(prisma.auctionImage.deleteMany).not.toHaveBeenCalled();
    });

    it('guards the write on the status and bid count it just checked', async () => {
      updateSucceeds(editableRow({ status: 'SCHEDULED' }));
      prisma.auction.findUniqueOrThrow
        .mockResolvedValueOnce({
          id: DRAFT_ID,
          title: 'x',
          description: 'x',
          condition: 'USED',
          startingPrice: dec(3000),
          minBidIncrement: dec(100),
          reservePrice: null,
          scheduledStartAt: new Date(Date.now() + 60 * 60 * 1000),
          originalEndAt: new Date(Date.now() + 4 * 60 * 60 * 1000),
          category: { isActive: true },
          images: [{ id: 'image-1' }]
        })
        .mockResolvedValueOnce(draftRow());

      await service.updateOwnAuction(DRAFT_ID, SELLER_ID, { title: 'x' });

      expect(updateArgs().where).toMatchObject({
        id: DRAFT_ID,
        sellerId: SELLER_ID,
        status: 'SCHEDULED',
        bidCount: 0,
        deletedAt: null
      });
    });

    it('reports a conflict when the guarded write matches no row', async () => {
      prisma.auction.findFirst.mockResolvedValue(editableRow());
      prisma.auction.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.updateOwnAuction(DRAFT_ID, SELLER_ID, { title: 'Renamed' })
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects a category that is not active before touching anything', async () => {
      prisma.category.findUnique.mockResolvedValue({ isActive: false });

      await expect(
        service.updateOwnAuction(DRAFT_ID, SELLER_ID, {
          categoryId: CATEGORY_ID
        })
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('hides an auction owned by somebody else behind a 404', async () => {
      prisma.auction.findFirst.mockResolvedValue(null);

      await expect(
        service.updateOwnAuction(DRAFT_ID, 'another-seller', { title: 'x' })
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('cancelOwnAuction (AUC-006)', () => {
    const cancellableRow = (overrides: Record<string, unknown> = {}) => ({
      status: 'SCHEDULED',
      bidCount: 0,
      ...overrides
    });

    const cancelSucceeds = (row: ReturnType<typeof cancellableRow>) => {
      prisma.auction.findFirst.mockResolvedValue(row);
      prisma.auction.updateMany.mockResolvedValue({ count: 1 });
      prisma.auctionEvent.create.mockResolvedValue({});
      prisma.auction.findUniqueOrThrow.mockResolvedValue(
        draftRow({ status: 'CANCELLED' })
      );
    };

    const updateArgs = () =>
      (
        prisma.auction.updateMany.mock.calls as {
          where: Record<string, unknown>;
          data: Record<string, unknown>;
        }[][]
      )[0][0];

    it('moves the auction to CANCELLED and stamps when it ended', async () => {
      cancelSucceeds(cancellableRow());

      await service.cancelOwnAuction(DRAFT_ID, SELLER_ID);

      const { data } = updateArgs();
      expect(data.status).toBe('CANCELLED');
      expect(data.endedAt).toBeInstanceOf(Date);
    });

    it('stores the reason when one is given', async () => {
      cancelSucceeds(cancellableRow());

      await service.cancelOwnAuction(DRAFT_ID, SELLER_ID, 'Item was damaged');

      expect(updateArgs().data.cancellationReason).toBe('Item was damaged');
    });

    it('accepts a cancellation with no reason', async () => {
      cancelSucceeds(cancellableRow());

      await service.cancelOwnAuction(DRAFT_ID, SELLER_ID);

      expect(updateArgs().data.cancellationReason).toBeUndefined();
    });

    it('records the CANCELLED event', async () => {
      cancelSucceeds(cancellableRow());

      await service.cancelOwnAuction(DRAFT_ID, SELLER_ID);

      expect(prisma.auctionEvent.create).toHaveBeenCalledWith({
        data: {
          auctionId: DRAFT_ID,
          actorUserId: SELLER_ID,
          eventType: 'CANCELLED'
        }
      });
    });

    it('cancels a DRAFT as readily as a SCHEDULED one', async () => {
      cancelSucceeds(cancellableRow({ status: 'DRAFT' }));

      await service.cancelOwnAuction(DRAFT_ID, SELLER_ID);

      expect(updateArgs().data.status).toBe('CANCELLED');
    });

    it('refuses to cancel an ACTIVE auction — that is an admin action', async () => {
      prisma.auction.findFirst.mockResolvedValue(
        cancellableRow({ status: 'ACTIVE' })
      );

      await expect(
        service.cancelOwnAuction(DRAFT_ID, SELLER_ID)
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.auction.updateMany).not.toHaveBeenCalled();
      expect(prisma.auctionEvent.create).not.toHaveBeenCalled();
    });

    it('refuses to cancel one that already has bids', async () => {
      prisma.auction.findFirst.mockResolvedValue(
        cancellableRow({ bidCount: 1 })
      );

      await expect(
        service.cancelOwnAuction(DRAFT_ID, SELLER_ID)
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('does the cancellation inside one transaction', async () => {
      cancelSucceeds(cancellableRow());

      await service.cancelOwnAuction(DRAFT_ID, SELLER_ID);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    /**
     * NOT-004 — everybody who bid on it or was watching was waiting on
     * something that is not going to happen now.
     */
    describe('telling the people who were following it (NOT-004)', () => {
      const WATCHER_ID = '00000000-0000-4000-8000-0000000004f6';

      const writtenRows = () =>
        (
          prisma.notification.createMany.mock.calls as {
            data: { userId: string; type: string; message: string }[];
          }[][]
        )[0][0].data;

      it('writes a row for each of them, in the cancelling transaction', async () => {
        cancelSucceeds(cancellableRow());
        prisma.watchlist.findMany.mockResolvedValue([{ userId: WATCHER_ID }]);

        await service.cancelOwnAuction(DRAFT_ID, SELLER_ID, 'Sold elsewhere');

        expect(writtenRows()).toEqual([
          expect.objectContaining({
            userId: WATCHER_ID,
            type: 'AUCTION_CANCELLED',
            auctionId: DRAFT_ID
          })
        ]);
        expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      });

      it('passes the seller’s reason on to them', async () => {
        cancelSucceeds(cancellableRow());
        prisma.watchlist.findMany.mockResolvedValue([{ userId: WATCHER_ID }]);

        await service.cancelOwnAuction(DRAFT_ID, SELLER_ID, 'Sold elsewhere');

        expect(writtenRows()[0].message).toContain('Sold elsewhere');
      });

      // they are the one who just cancelled it
      it('does not tell the seller', async () => {
        cancelSucceeds(cancellableRow());
        prisma.watchlist.findMany.mockResolvedValue([{ userId: SELLER_ID }]);

        await service.cancelOwnAuction(DRAFT_ID, SELLER_ID);

        expect(writtenRows()).toEqual([]);
      });

      it('pushes each row to its owner after the commit', async () => {
        cancelSucceeds(cancellableRow());
        prisma.watchlist.findMany.mockResolvedValue([{ userId: WATCHER_ID }]);

        await service.cancelOwnAuction(DRAFT_ID, SELLER_ID);

        expect(realtime.emitNotificationCreated).toHaveBeenCalledWith(
          WATCHER_ID,
          expect.objectContaining({ type: 'AUCTION_CANCELLED' })
        );
      });

      it('sends nothing when the guarded write matched no row', async () => {
        prisma.auction.findFirst.mockResolvedValue(cancellableRow());
        prisma.auction.updateMany.mockResolvedValue({ count: 0 });
        prisma.watchlist.findMany.mockResolvedValue([{ userId: WATCHER_ID }]);

        await expect(
          service.cancelOwnAuction(DRAFT_ID, SELLER_ID)
        ).rejects.toBeInstanceOf(ConflictException);
        expect(realtime.emitNotificationCreated).not.toHaveBeenCalled();
      });
    });

    it('reports a conflict when the guarded write matches no row', async () => {
      prisma.auction.findFirst.mockResolvedValue(cancellableRow());
      prisma.auction.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.cancelOwnAuction(DRAFT_ID, SELLER_ID)
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.auctionEvent.create).not.toHaveBeenCalled();
    });

    it('hides an auction owned by somebody else behind a 404', async () => {
      prisma.auction.findFirst.mockResolvedValue(null);

      await expect(
        service.cancelOwnAuction(DRAFT_ID, 'another-seller')
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  /**
   * AUC-007 — the highest valid bid that clears the reserve ends the auction as
   * SOLD with the winner and winning price recorded; no bids, or a top bid
   * under the reserve, ends it UNSOLD.
   */
  describe('settleAuction (AUC-007)', () => {
    const ended = (overrides: Record<string, unknown> = {}) => ({
      id: DRAFT_ID,
      currentEndAt: new Date(Date.now() - 60 * 1000),
      reservePrice: dec(4500),
      bidCount: 1,
      // NOT-002 / NOT-003 read these to write the notifications
      title: 'Vintage Seiko 5 Automatic',
      currency: 'THB',
      sellerId: SELLER_ID,
      ...overrides
    });

    // shaped like settledWinnerSelect: the profile rides along so the
    // announcement can mask the winner without a second read
    const bid = (amount: string | number, bidderId = 'bidder-1') => ({
      id: 'bid-1',
      bidderId,
      amount: dec(amount),
      bidder: { profile: { displayName: 'Somchai' } }
    });

    const settleWith = (
      auction: ReturnType<typeof ended>,
      highestBid: ReturnType<typeof bid> | null
    ) => {
      prisma.auction.findFirst.mockResolvedValue(auction);
      prisma.bid.findFirst.mockResolvedValue(highestBid);
      prisma.auction.updateMany.mockResolvedValue({ count: 1 });
      prisma.auctionEvent.create.mockResolvedValue({});
    };

    const updateData = () =>
      (
        prisma.auction.updateMany.mock.calls as {
          where: Record<string, unknown>;
          data: Record<string, unknown>;
        }[][]
      )[0][0].data;

    it('ends SOLD when the top bid clears the reserve', async () => {
      settleWith(ended(), bid(5000, 'winner-id'));

      const result = await service.settleAuction(DRAFT_ID);

      expect(result).toEqual({ sold: true });
      expect(updateData()).toMatchObject({
        status: 'SOLD',
        winnerUserId: 'winner-id',
        winningBidId: 'bid-1'
      });
    });

    it('records the winning price, not the reserve', async () => {
      settleWith(ended(), bid(5000));

      await service.settleAuction(DRAFT_ID);

      expect((updateData().soldPrice as Prisma.Decimal).toString()).toBe(
        '5000'
      );
    });

    it('ends SOLD when the top bid exactly meets the reserve', async () => {
      settleWith(ended(), bid(4500));

      await service.settleAuction(DRAFT_ID);

      expect(updateData().status).toBe('SOLD');
    });

    it('ends UNSOLD when the top bid is under the reserve', async () => {
      settleWith(ended(), bid(4499));

      const result = await service.settleAuction(DRAFT_ID);

      expect(result).toEqual({ sold: false });
      expect(updateData()).toMatchObject({
        status: 'UNSOLD',
        winnerUserId: null,
        winningBidId: null,
        soldPrice: null
      });
    });

    it('ends UNSOLD when nobody bid at all', async () => {
      settleWith(ended(), null);

      const result = await service.settleAuction(DRAFT_ID);

      expect(result).toEqual({ sold: false });
      expect(updateData().status).toBe('UNSOLD');
    });

    it('ends SOLD on any bid when the auction has no reserve', async () => {
      settleWith(ended({ reservePrice: null }), bid(1));

      await service.settleAuction(DRAFT_ID);

      expect(updateData().status).toBe('SOLD');
    });

    it('takes the highest bid, and the earliest of equal ones', async () => {
      settleWith(ended(), bid(5000));

      await service.settleAuction(DRAFT_ID);

      const args = (
        prisma.bid.findFirst.mock.calls as { orderBy: unknown }[][]
      )[0][0];
      expect(args.orderBy).toEqual([{ amount: 'desc' }, { sequenceNo: 'asc' }]);
    });

    it('stamps when the auction ended', async () => {
      settleWith(ended(), bid(5000));

      await service.settleAuction(DRAFT_ID);

      expect(updateData().endedAt).toBeInstanceOf(Date);
    });

    it('records an ENDED event pointing at the winning bid', async () => {
      settleWith(ended(), bid(5000));

      await service.settleAuction(DRAFT_ID);

      expect(prisma.auctionEvent.create).toHaveBeenCalledWith({
        data: { auctionId: DRAFT_ID, eventType: 'ENDED', bidId: 'bid-1' }
      });
    });

    it('records an ENDED event with no bid when there were none', async () => {
      settleWith(ended(), null);

      await service.settleAuction(DRAFT_ID);

      expect(prisma.auctionEvent.create).toHaveBeenCalledWith({
        data: { auctionId: DRAFT_ID, eventType: 'ENDED', bidId: undefined }
      });
    });

    describe('leaves alone what it should', () => {
      it('does nothing while the auction is still running', async () => {
        prisma.auction.findFirst.mockResolvedValue(
          ended({ currentEndAt: new Date(Date.now() + 60 * 60 * 1000) })
        );

        const result = await service.settleAuction(DRAFT_ID);

        expect(result).toBeNull();
        expect(prisma.auction.updateMany).not.toHaveBeenCalled();
      });

      it('does nothing for an auction that is not ACTIVE', async () => {
        // the ACTIVE filter means the lookup simply finds nothing
        prisma.auction.findFirst.mockResolvedValue(null);

        const result = await service.settleAuction(DRAFT_ID);

        expect(result).toBeNull();
        expect(prisma.auction.updateMany).not.toHaveBeenCalled();
      });

      it('does nothing when the auction has no end time', async () => {
        prisma.auction.findFirst.mockResolvedValue(
          ended({ currentEndAt: null })
        );

        expect(await service.settleAuction(DRAFT_ID)).toBeNull();
        expect(prisma.auction.updateMany).not.toHaveBeenCalled();
      });

      it('writes no second ENDED event when another reader settled first', async () => {
        prisma.auction.findFirst.mockResolvedValue(ended());
        prisma.bid.findFirst.mockResolvedValue(bid(5000));
        prisma.auction.updateMany.mockResolvedValue({ count: 0 });

        const result = await service.settleAuction(DRAFT_ID);

        expect(result).toBeNull();
        expect(prisma.auctionEvent.create).not.toHaveBeenCalled();
      });
    });

    it('settles inside one transaction', async () => {
      settleWith(ended(), bid(5000));

      await service.settleAuction(DRAFT_ID);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    // LIV-004 — a result is final in a way a price is not, so it is announced
    // only once it is on record
    describe('announcing the result (LIV-004)', () => {
      const announcement = () =>
        (
          gateway.emitToAuction.mock.calls as [
            string,
            string,
            Record<string, unknown>
          ][]
        )[0];

      it('tells the room a sale happened, with the winner masked', async () => {
        settleWith(ended(), bid(5000));

        await service.settleAuction(DRAFT_ID);

        const [auctionId, event, payload] = announcement();
        expect(auctionId).toBe(DRAFT_ID);
        expect(event).toBe('auction:ended');
        expect(payload).toMatchObject({
          status: 'SOLD',
          soldPrice: '5000',
          winner: 'S***i'
        });
      });

      it('tells the room an auction did not sell', async () => {
        settleWith(ended(), bid(4000));

        await service.settleAuction(DRAFT_ID);

        expect(announcement()[2]).toMatchObject({
          status: 'UNSOLD',
          soldPrice: null,
          winner: null
        });
      });

      // SRS section 6 — a rollback would take the sale back, and a result
      // cannot be corrected by a later event the way a price can
      it('announces nothing when it lost the race to settle', async () => {
        prisma.auction.findFirst.mockResolvedValue(ended());
        prisma.bid.findFirst.mockResolvedValue(bid(5000));
        prisma.auction.updateMany.mockResolvedValue({ count: 0 });

        await service.settleAuction(DRAFT_ID);

        expect(gateway.emitToAuction).not.toHaveBeenCalled();
      });

      it('announces nothing for an auction that is not due', async () => {
        prisma.auction.findFirst.mockResolvedValue(null);

        await service.settleAuction(DRAFT_ID);

        expect(gateway.emitToAuction).not.toHaveBeenCalled();
      });

      // AUC-003 — the reserve stays private after the auction ends too
      it('never puts the reserve in the announcement', async () => {
        settleWith(ended({ reservePrice: dec(4500) }), bid(5000));

        await service.settleAuction(DRAFT_ID);

        expect(JSON.stringify(announcement()[2])).not.toContain('4500');
      });
    });

    /**
     * NOT-002 / NOT-003 — the winner is told they won; everybody else with a
     * stake is told it is over.
     */
    describe('notifying about the result (NOT-002 / NOT-003)', () => {
      const WINNER_ID = 'bidder-1';
      const WATCHER_ID = '00000000-0000-4000-8000-0000000004d4';

      /** Who bid on it and who was watching. */
      const audienceOf = (bidders: string[], watchers: string[]) => {
        prisma.bid.findMany.mockResolvedValue(
          bidders.map((bidderId) => ({ bidderId }))
        );
        prisma.watchlist.findMany.mockResolvedValue(
          watchers.map((userId) => ({ userId }))
        );
      };

      const writtenRows = () =>
        (
          prisma.notification.createMany.mock.calls as {
            data: { userId: string; type: string }[];
          }[][]
        )[0][0].data;

      it('tells the winner they won, in the settling transaction', async () => {
        settleWith(ended(), bid(5000));
        audienceOf([WINNER_ID], []);

        await service.settleAuction(DRAFT_ID);

        expect(writtenRows()).toContainEqual(
          expect.objectContaining({ userId: WINNER_ID, type: 'AUCTION_WON' })
        );
        expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      });

      // two rows about the same event would read as a mistake
      it('does not also tell the winner the auction ended', async () => {
        settleWith(ended(), bid(5000));
        audienceOf([WINNER_ID], [WINNER_ID]);

        await service.settleAuction(DRAFT_ID);

        const theirs = writtenRows().filter((row) => row.userId === WINNER_ID);
        expect(theirs.map((row) => row.type)).toEqual(['AUCTION_WON']);
      });

      it('tells the seller their auction ended', async () => {
        settleWith(ended(), bid(5000));
        audienceOf([WINNER_ID], []);

        await service.settleAuction(DRAFT_ID);

        expect(writtenRows()).toContainEqual(
          expect.objectContaining({
            userId: SELLER_ID,
            type: 'AUCTION_ENDED'
          })
        );
      });

      it('tells a watcher who never bid', async () => {
        settleWith(ended(), bid(5000));
        audienceOf([WINNER_ID], [WATCHER_ID]);

        await service.settleAuction(DRAFT_ID);

        expect(writtenRows()).toContainEqual(
          expect.objectContaining({
            userId: WATCHER_ID,
            type: 'AUCTION_ENDED'
          })
        );
      });

      it('tells a losing bidder, and nobody twice', async () => {
        const loser = '00000000-0000-4000-8000-0000000004e5';
        settleWith(ended(), bid(5000));
        audienceOf([WINNER_ID, loser], [loser]);

        await service.settleAuction(DRAFT_ID);

        const rows = writtenRows().filter((row) => row.userId === loser);
        expect(rows.map((row) => row.type)).toEqual(['AUCTION_ENDED']);
      });

      it('nobody wins an auction that did not sell', async () => {
        settleWith(ended(), bid(4000));
        audienceOf(['bidder-1'], []);

        await service.settleAuction(DRAFT_ID);

        const types = writtenRows().map((row) => row.type);
        expect(types).not.toContain('AUCTION_WON');
        expect(types).toContain('AUCTION_ENDED');
      });

      it('still tells the seller when nobody bid at all', async () => {
        settleWith(ended({ bidCount: 0 }), null);
        audienceOf([], []);

        await service.settleAuction(DRAFT_ID);

        expect(writtenRows()).toEqual([
          expect.objectContaining({
            userId: SELLER_ID,
            type: 'AUCTION_ENDED'
          })
        ]);
      });

      it('pushes every row to its owner once the transaction commits', async () => {
        settleWith(ended(), bid(5000));
        audienceOf([WINNER_ID], [WATCHER_ID]);

        await service.settleAuction(DRAFT_ID);

        expect(realtime.emitNotificationCreated).toHaveBeenCalledTimes(3);
      });

      it('writes and sends nothing when it lost the race to settle', async () => {
        prisma.auction.findFirst.mockResolvedValue(ended());
        prisma.bid.findFirst.mockResolvedValue(bid(5000));
        prisma.auction.updateMany.mockResolvedValue({ count: 0 });

        await service.settleAuction(DRAFT_ID);

        expect(prisma.notification.createMany).not.toHaveBeenCalled();
        expect(realtime.emitNotificationCreated).not.toHaveBeenCalled();
      });
    });
  });

  /**
   * AUC-008 — Hot Auctions. Only ACTIVE, undeleted auctions, ranked by accepted
   * bids desc, then soonest end, then id — and nothing else.
   */
  describe('listAuctions (AUC-008)', () => {
    const listSucceeds = (
      rows: ReturnType<typeof draftRow>[],
      total = rows.length
    ) => {
      prisma.auction.findMany.mockResolvedValue(rows);
      prisma.auction.count.mockResolvedValue(total);
    };

    const findManyArgs = () =>
      (
        prisma.auction.findMany.mock.calls as {
          where: Record<string, unknown>;
          orderBy: unknown;
          skip: number;
          take: number;
        }[][]
      )[0][0];

    it('lists only auctions that are ACTIVE and not deleted', async () => {
      listSucceeds([]);

      await service.listAuctions({});

      expect(findManyArgs().where).toEqual({
        status: 'ACTIVE',
        deletedAt: null
      });
    });

    it('ranks by accepted bids, then soonest end, then id', async () => {
      listSucceeds([]);

      await service.listAuctions({});

      expect(findManyArgs().orderBy).toEqual([
        { bidCount: 'desc' },
        { currentEndAt: 'asc' },
        { id: 'asc' }
      ]);
    });

    it('counts with exactly the same filter it lists with', async () => {
      listSucceeds([]);

      await service.listAuctions({});

      const countArgs = (
        prisma.auction.count.mock.calls as WhereArgs[][]
      )[0][0];
      expect(countArgs.where).toEqual(findManyArgs().where);
    });

    it('never exposes the reserve in the list', async () => {
      listSucceeds([draftRow({ status: 'ACTIVE' })]);

      const result = await service.listAuctions({});

      expect(result.items[0]).not.toHaveProperty('reservePrice');
      expect(JSON.stringify(result.items)).not.toContain('4500');
    });

    describe('paging', () => {
      it('defaults to the first page of twenty', async () => {
        listSucceeds([]);

        await service.listAuctions({});

        expect(findManyArgs()).toMatchObject({ skip: 0, take: 20 });
      });

      it('skips whole pages, not rows', async () => {
        listSucceeds([]);

        await service.listAuctions({ page: 3, limit: 10 });

        expect(findManyArgs()).toMatchObject({ skip: 20, take: 10 });
      });

      it('reports how many pages there are', async () => {
        listSucceeds([], 45);

        const result = await service.listAuctions({ limit: 20 });

        expect(result.meta).toEqual({
          page: 1,
          limit: 20,
          total: 45,
          totalPages: 3
        });
      });

      it('reports zero pages when nothing is running', async () => {
        listSucceeds([], 0);

        const result = await service.listAuctions({});

        expect(result.meta).toMatchObject({ total: 0, totalPages: 0 });
        expect(result.items).toEqual([]);
      });
    });

    /**
     * The three sections beyond `hot` come from the home page design rather
     * than the SRS, so what holds them honest lives here: each one may only
     * rearrange auctions a buyer could already see, and none may reach past
     * the filters AUC-005 and AUC-008 already impose.
     */
    describe('sections', () => {
      it('reads the hot list when no section is named', async () => {
        listSucceeds([]);

        await service.listAuctions({});

        expect(findManyArgs().where).toEqual({
          status: 'ACTIVE',
          deletedAt: null
        });
        expect(findManyArgs().orderBy).toEqual([
          { bidCount: 'desc' },
          { currentEndAt: 'asc' },
          { id: 'asc' }
        ]);
      });

      it('treats an explicit hot section as the same request', async () => {
        listSucceeds([]);

        await service.listAuctions({ section: 'hot' });

        expect(findManyArgs().where).toEqual({
          status: 'ACTIVE',
          deletedAt: null
        });
      });

      // running, closest deadline first, measured by `currentEndAt` so an
      // auction anti-sniping pushed back (BID-004) moves down the list instead
      // of going on claiming it is about to close
      it('orders ending-soon by the deadline actually in force', async () => {
        listSucceeds([]);

        await service.listAuctions({ section: 'ending-soon' });

        expect(findManyArgs().where).toEqual({
          status: 'ACTIVE',
          deletedAt: null
        });
        expect(findManyArgs().orderBy).toEqual([
          { currentEndAt: 'asc' },
          { id: 'asc' }
        ]);
      });

      it('lists starting-soon from the scheduled ones, soonest first', async () => {
        listSucceeds([]);

        await service.listAuctions({ section: 'starting-soon' });

        expect(findManyArgs().where).toEqual({
          status: 'SCHEDULED',
          deletedAt: null
        });
        expect(findManyArgs().orderBy).toEqual([
          { scheduledStartAt: 'asc' },
          { id: 'asc' }
        ]);
      });

      // `endedAt` is when settlement recorded the outcome (AUC-007), which is
      // the honest answer to "recently ended"; `currentEndAt` is only when the
      // auction was due to end
      it('orders recently-ended by when settlement recorded the outcome', async () => {
        listSucceeds([]);

        await service.listAuctions({ section: 'recently-ended' });

        expect(findManyArgs().where).toEqual({
          status: { in: ['SOLD', 'UNSOLD'] },
          deletedAt: null
        });
        expect(findManyArgs().orderBy).toEqual([
          { endedAt: { sort: 'desc', nulls: 'last' } },
          { id: 'desc' }
        ]);
      });

      // the column is nullable and Postgres sorts nulls first on a descending
      // sort, so a row missing one would lead a list of the newest results
      it('keeps a missing endedAt out of the front of recently-ended', async () => {
        listSucceeds([]);

        await service.listAuctions({ section: 'recently-ended' });

        const [first] = findManyArgs().orderBy as Record<string, unknown>[];
        expect(first.endedAt).toMatchObject({ nulls: 'last' });
      });

      it.each(AUCTION_SECTIONS)(
        'hides deleted auctions from %s',
        async (section) => {
          listSucceeds([]);

          await service.listAuctions({ section });

          expect(findManyArgs().where).toMatchObject({ deletedAt: null });
        }
      );

      it.each(AUCTION_SECTIONS)(
        'counts %s with the filter it lists with',
        async (section) => {
          listSucceeds([]);

          await service.listAuctions({ section });

          const countArgs = (
            prisma.auction.count.mock.calls as WhereArgs[][]
          )[0][0];
          expect(countArgs.where).toEqual(findManyArgs().where);
        }
      );

      it.each(AUCTION_SECTIONS)(
        'never exposes the reserve through %s',
        async (section) => {
          listSucceeds([draftRow({ status: 'ACTIVE' })]);

          const result = await service.listAuctions({ section });

          expect(result.items[0]).not.toHaveProperty('reservePrice');
          expect(JSON.stringify(result.items)).not.toContain('4500');
        }
      );

      /**
       * AUC-005 — a section arranges what a buyer may already see. Without
       * this, a section added later could name DRAFT or CANCELLED in its
       * filter and quietly publish auctions the single read hides.
       */
      it.each(AUCTION_SECTIONS)(
        'only asks %s for statuses a buyer may see',
        (section) => {
          const { status } = AUCTION_SECTION_QUERIES[section].where as {
            status: string | { in: string[] };
          };
          const asked = typeof status === 'string' ? [status] : status.in;

          expect(asked.length).toBeGreaterThan(0);
          for (const one of asked) {
            expect(PUBLIC_AUCTION_STATUSES).toContain(one);
          }
        }
      );

      // a stable order is what makes paging trustworthy — HOT_AUCTION_ORDER
      // spells out why
      it.each(AUCTION_SECTIONS)('breaks ties on the id in %s', (section) => {
        const { orderBy } = AUCTION_SECTION_QUERIES[section];
        const last = orderBy[orderBy.length - 1];

        expect(Object.keys(last)).toEqual(['id']);
      });
    });
  });
});
