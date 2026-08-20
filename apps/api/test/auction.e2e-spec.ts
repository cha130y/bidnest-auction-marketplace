import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { authRegistry } from './helpers/auth';
import { PrismaService } from './../src/prisma/prisma.service';

/**
 * AUC-001 — exercises the acceptance criterion end to end: a seller creates a
 * private draft holding title, description, an active category, condition,
 * starting price, minimum increment, an optional reserve, a schedule and images.
 */
describe('Auction drafts (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  // Unique per run so repeated local runs never collide on the unique indexes.
  const run = Date.now();
  const sellerEmail = `auction-seller-${run}@example.com`;
  const strangerEmail = `auction-stranger-${run}@example.com`;
  const adminEmail = `auction-admin-${run}@example.com`;

  let sellerId: string;
  let authOf: (userId: string) => string;
  let strangerId: string;
  let adminId: string;
  let activeCategoryId: string;
  let inactiveCategoryId: string;

  const draftBody = () => ({
    title: 'Vintage Seiko 5 Automatic',
    description: 'Serviced last year, original bracelet.',
    categoryId: activeCategoryId,
    condition: 'USED',
    startingPrice: 3000,
    minBidIncrement: 100,
    reservePrice: 4500,
    scheduledStartAt: '2026-09-01T10:00:00.000Z',
    scheduledEndAt: '2026-09-01T12:00:00.000Z',
    imageUrls: [
      'https://placehold.co/600x400?text=Front',
      'https://placehold.co/600x400?text=Back'
    ]
  });

  const createUser = async (email: string, role: 'USER' | 'ADMIN') => {
    const user = await prisma.user.create({
      data: {
        email,
        role,
        status: 'ACTIVE',
        profile: { create: { firstName: 'E2E', displayName: `e2e-${email}` } }
      },
      select: { id: true }
    });
    return user.id;
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    app = configureApp(
      moduleFixture.createNestApplication()
    ) as INestApplication<App>;
    prisma = app.get(PrismaService);
    await app.init();

    sellerId = await createUser(sellerEmail, 'USER');
    strangerId = await createUser(strangerEmail, 'USER');
    adminId = await createUser(adminEmail, 'ADMIN');

    const active = await prisma.category.create({
      data: { name: `E2E Active ${run}`, slug: `e2e-active-${run}` },
      select: { id: true }
    });
    activeCategoryId = active.id;

    const inactive = await prisma.category.create({
      data: {
        name: `E2E Inactive ${run}`,
        slug: `e2e-inactive-${run}`,
        isActive: false
      },
      select: { id: true }
    });
    inactiveCategoryId = inactive.id;

    authOf = await authRegistry(app, [sellerId, strangerId, adminId]);
  });

  afterAll(async () => {
    const userIds = [sellerId, strangerId, adminId];
    await prisma.auction.deleteMany({ where: { sellerId: { in: userIds } } });
    await prisma.category.deleteMany({
      where: { id: { in: [activeCategoryId, inactiveCategoryId] } }
    });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  describe('POST /auctions/drafts', () => {
    it('creates a DRAFT holding every field of the draft', async () => {
      const response = await request(app.getHttpServer())
        .post('/auctions/drafts')
        .set('Authorization', authOf(sellerId))
        .send(draftBody())
        .expect(201);

      expect(response.body).toMatchObject({
        title: 'Vintage Seiko 5 Automatic',
        description: 'Serviced last year, original bracelet.',
        condition: 'USED',
        status: 'DRAFT',
        currency: 'THB',
        startingPrice: '3000',
        minBidIncrement: '100',
        reservePrice: '4500',
        scheduledStartAt: '2026-09-01T10:00:00.000Z',
        originalEndAt: '2026-09-01T12:00:00.000Z',
        currentEndAt: '2026-09-01T12:00:00.000Z',
        category: { id: activeCategoryId },
        seller: { id: sellerId }
      });
      const body = response.body as { images: unknown[] };
      expect(body.images).toEqual([
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
    });

    it('records the CREATED lifecycle event alongside the draft', async () => {
      const response = await request(app.getHttpServer())
        .post('/auctions/drafts')
        .set('Authorization', authOf(sellerId))
        .send(draftBody())
        .expect(201);

      const body = response.body as { id: string };
      const events = await prisma.auctionEvent.findMany({
        where: { auctionId: body.id }
      });
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        eventType: 'CREATED',
        actorUserId: sellerId
      });
    });

    it('accepts a draft with no reserve, no schedule and no images yet', async () => {
      const {
        reservePrice,
        scheduledStartAt,
        scheduledEndAt,
        imageUrls,
        ...rest
      } = draftBody();
      void [reservePrice, scheduledStartAt, scheduledEndAt, imageUrls];

      const response = await request(app.getHttpServer())
        .post('/auctions/drafts')
        .set('Authorization', authOf(sellerId))
        .send(rest)
        .expect(201);

      expect(response.body).toMatchObject({
        status: 'DRAFT',
        reservePrice: null,
        scheduledStartAt: null,
        currentEndAt: null,
        images: []
      });
    });

    it('rejects a category an admin has deactivated', () => {
      return request(app.getHttpServer())
        .post('/auctions/drafts')
        .set('Authorization', authOf(sellerId))
        .send({ ...draftBody(), categoryId: inactiveCategoryId })
        .expect(400);
    });

    it('rejects a non-positive starting price', () => {
      return request(app.getHttpServer())
        .post('/auctions/drafts')
        .set('Authorization', authOf(sellerId))
        .send({ ...draftBody(), startingPrice: 0 })
        .expect(400);
    });

    it('rejects a missing title', () => {
      const { title, ...withoutTitle } = draftBody();
      void title;

      return request(app.getHttpServer())
        .post('/auctions/drafts')
        .set('Authorization', authOf(sellerId))
        .send(withoutTitle)
        .expect(400);
    });

    it('strips unknown fields instead of trusting them', () => {
      return request(app.getHttpServer())
        .post('/auctions/drafts')
        .set('Authorization', authOf(sellerId))
        .send({ ...draftBody(), status: 'ACTIVE' })
        .expect(400);
    });

    it('refuses an anonymous caller', () => {
      return request(app.getHttpServer())
        .post('/auctions/drafts')
        .send(draftBody())
        .expect(401);
    });

    it('refuses an admin, who moderates rather than sells', () => {
      return request(app.getHttpServer())
        .post('/auctions/drafts')
        .set('Authorization', authOf(adminId))
        .send(draftBody())
        .expect(403);
    });
  });

  describe('draft privacy', () => {
    let draftId: string;

    beforeAll(async () => {
      const response = await request(app.getHttpServer())
        .post('/auctions/drafts')
        .set('Authorization', authOf(sellerId))
        .send(draftBody())
        .expect(201);
      draftId = (response.body as { id: string }).id;
    });

    it('lets the owner read their own draft', async () => {
      const response = await request(app.getHttpServer())
        .get(`/auctions/drafts/${draftId}`)
        .set('Authorization', authOf(sellerId))
        .expect(200);

      expect(response.body).toMatchObject({ id: draftId, status: 'DRAFT' });
    });

    it('hides the draft from another logged-in user', () => {
      return request(app.getHttpServer())
        .get(`/auctions/drafts/${draftId}`)
        .set('Authorization', authOf(strangerId))
        .expect(404);
    });

    it('hides the draft from an anonymous caller', () => {
      return request(app.getHttpServer())
        .get(`/auctions/drafts/${draftId}`)
        .expect(401);
    });

    it('lists the seller their own drafts only', async () => {
      const response = await request(app.getHttpServer())
        .get('/auctions/drafts')
        .set('Authorization', authOf(sellerId))
        .expect(200);

      const body = response.body as { items: { id: string; status: string }[] };
      expect(body.items.length).toBeGreaterThan(0);
      expect(body.items.every((item) => item.status === 'DRAFT')).toBe(true);
      expect(body.items.map((item) => item.id)).toContain(draftId);

      const stranger = await request(app.getHttpServer())
        .get('/auctions/drafts')
        .set('Authorization', authOf(strangerId))
        .expect(200);
      expect((stranger.body as { items: unknown[] }).items).toEqual([]);
    });
  });

  /**
   * AUC-002 — every acceptance rule the draft must satisfy before it may be
   * published: the required fields, amounts above zero, an end after the start,
   * at least one image and a reserve no lower than the starting price.
   */
  describe('GET /auctions/drafts/:id/validation', () => {
    /** Creates a draft from `draftBody()` with the given fields overridden. */
    const createDraft = async (overrides: Record<string, unknown> = {}) => {
      const response = await request(app.getHttpServer())
        .post('/auctions/drafts')
        .set('Authorization', authOf(sellerId))
        .send({ ...draftBody(), ...overrides })
        .expect(201);
      return (response.body as { id: string }).id;
    };

    const validationOf = async (draftId: string, userId = sellerId) => {
      const response = await request(app.getHttpServer())
        .get(`/auctions/drafts/${draftId}/validation`)
        .set('Authorization', authOf(userId))
        .expect(200);
      return response.body as {
        auctionId: string;
        ready: boolean;
        issues: { field: string; code: string; message: string }[];
      };
    };

    it('reports a complete draft as ready to publish', async () => {
      const draftId = await createDraft();

      expect(await validationOf(draftId)).toEqual({
        auctionId: draftId,
        ready: true,
        issues: []
      });
    });

    it('reports a draft with no schedule and no images as not ready', async () => {
      const { scheduledStartAt, scheduledEndAt, imageUrls, ...rest } =
        draftBody();
      void [scheduledStartAt, scheduledEndAt, imageUrls];

      const response = await request(app.getHttpServer())
        .post('/auctions/drafts')
        .set('Authorization', authOf(sellerId))
        .send(rest)
        .expect(201);
      const draftId = (response.body as { id: string }).id;

      const validation = await validationOf(draftId);
      expect(validation.ready).toBe(false);
      expect(validation.issues.map((issue) => issue.code)).toEqual(
        expect.arrayContaining([
          'START_AT_REQUIRED',
          'END_AT_REQUIRED',
          'IMAGES_REQUIRED'
        ])
      );
    });

    it('rejects an end time that is not after the start time', async () => {
      const draftId = await createDraft({
        scheduledStartAt: '2026-09-01T12:00:00.000Z',
        scheduledEndAt: '2026-09-01T10:00:00.000Z'
      });

      const validation = await validationOf(draftId);
      expect(validation.ready).toBe(false);
      expect(validation.issues).toContainEqual(
        expect.objectContaining({
          field: 'scheduledEndAt',
          code: 'END_AT_NOT_AFTER_START_AT'
        })
      );
    });

    it('rejects a reserve below the starting price', async () => {
      const draftId = await createDraft({
        startingPrice: 3000,
        reservePrice: 2999
      });

      const validation = await validationOf(draftId);
      expect(validation.ready).toBe(false);
      expect(validation.issues).toContainEqual(
        expect.objectContaining({
          field: 'reservePrice',
          code: 'RESERVE_BELOW_STARTING_PRICE'
        })
      );
    });

    it('accepts a reserve equal to the starting price', async () => {
      const draftId = await createDraft({
        startingPrice: 3000,
        reservePrice: 3000
      });

      expect((await validationOf(draftId)).ready).toBe(true);
    });

    it('accepts a draft with no reserve at all', async () => {
      const { reservePrice, ...rest } = draftBody();
      void reservePrice;

      const response = await request(app.getHttpServer())
        .post('/auctions/drafts')
        .set('Authorization', authOf(sellerId))
        .send(rest)
        .expect(201);

      const draftId = (response.body as { id: string }).id;
      expect((await validationOf(draftId)).ready).toBe(true);
    });

    // ADR-0001 — the category was active at create time; publishing re-checks it
    it('flags a category an admin deactivated after the draft was saved', async () => {
      const draftId = await createDraft();
      await prisma.category.update({
        where: { id: activeCategoryId },
        data: { isActive: false }
      });

      try {
        const validation = await validationOf(draftId);
        expect(validation.ready).toBe(false);
        expect(validation.issues).toContainEqual(
          expect.objectContaining({
            field: 'categoryId',
            code: 'CATEGORY_INACTIVE'
          })
        );
      } finally {
        await prisma.category.update({
          where: { id: activeCategoryId },
          data: { isActive: true }
        });
      }
    });

    // AUC-003 — the checklist reports whether the reserve rule is met, never
    // the reserve itself, so it stays safe even though only the owner reads it
    it('never echoes the reserve price back', async () => {
      const draftId = await createDraft({ reservePrice: 4500 });

      const validation = await validationOf(draftId);
      expect(JSON.stringify(validation)).not.toContain('4500');
    });

    it('hides the checklist of a draft owned by somebody else', async () => {
      const draftId = await createDraft();

      return request(app.getHttpServer())
        .get(`/auctions/drafts/${draftId}/validation`)
        .set('Authorization', authOf(strangerId))
        .expect(404);
    });

    it('refuses an anonymous caller', async () => {
      const draftId = await createDraft();

      return request(app.getHttpServer())
        .get(`/auctions/drafts/${draftId}/validation`)
        .expect(401);
    });
  });

  /**
   * AUC-003 — the reserve never leaves the server on a buyer-facing path; only
   * the computed reserveMet does. There is no public auction endpoint yet
   * (AUC-004/005), so what can be proven over HTTP today is the owner's view:
   * reserveMet is present and correct, and it does not depend on the reserve
   * being visible. The mapper unit tests cover the buyer-facing shape.
   */
  describe('reserve confidentiality (AUC-003)', () => {
    it('gives the owner reserveMet alongside the reserve itself', async () => {
      const response = await request(app.getHttpServer())
        .post('/auctions/drafts')
        .set('Authorization', authOf(sellerId))
        .send(draftBody())
        .expect(201);

      // starting price 3000, reserve 4500, no bids yet -> not met
      expect(response.body).toMatchObject({
        reservePrice: '4500',
        currentPrice: '0',
        reserveMet: false
      });
    });

    it('reports reserveMet true when the draft has no reserve at all', async () => {
      const { reservePrice, ...rest } = draftBody();
      void reservePrice;

      const response = await request(app.getHttpServer())
        .post('/auctions/drafts')
        .set('Authorization', authOf(sellerId))
        .send(rest)
        .expect(201);

      expect(response.body).toMatchObject({
        reservePrice: null,
        reserveMet: true
      });
    });

    it('never writes a reserve_met_at column — reserveMet is computed on read', async () => {
      const response = await request(app.getHttpServer())
        .post('/auctions/drafts')
        .set('Authorization', authOf(sellerId))
        .send(draftBody())
        .expect(201);
      const { id } = response.body as { id: string };

      const columns = await prisma.$queryRaw<{ column_name: string }[]>`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'auctions'
      `;
      expect(columns.map((column) => column.column_name)).not.toContain(
        'reserve_met_at'
      );

      const stored = await prisma.auction.findUniqueOrThrow({
        where: { id },
        select: { reservePrice: true, currentPrice: true }
      });
      expect(stored.reservePrice?.toString()).toBe('4500');
    });
  });

  /**
   * AUC-004 — the seller previews the buyer's view without changing anything,
   * and a validated draft publishes into SCHEDULED or ACTIVE depending on
   * whether its start time has arrived.
   */
  describe('preview and publish (AUC-004)', () => {
    const hoursFromNow = (hours: number) =>
      new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();

    /** Creates a draft, overriding whichever fields the test cares about. */
    const createDraft = async (overrides: Record<string, unknown> = {}) => {
      const response = await request(app.getHttpServer())
        .post('/auctions/drafts')
        .set(MOCK_USER_HEADER, sellerId)
        .send({ ...draftBody(), ...overrides })
        .expect(201);
      return (response.body as { id: string }).id;
    };

    describe('GET /auctions/drafts/:id/preview', () => {
      it('shows the buyer-facing shape without the reserve', async () => {
        const draftId = await createDraft();

        const response = await request(app.getHttpServer())
          .get(`/auctions/drafts/${draftId}/preview`)
          .set(MOCK_USER_HEADER, sellerId)
          .expect(200);

        expect(response.body).not.toHaveProperty('reservePrice');
        expect(JSON.stringify(response.body)).not.toContain('4500');
        expect(response.body).toMatchObject({
          id: draftId,
          reserveMet: false,
          title: 'Vintage Seiko 5 Automatic'
        });
      });

      it('leaves the draft in DRAFT — preview changes no state', async () => {
        const draftId = await createDraft();

        await request(app.getHttpServer())
          .get(`/auctions/drafts/${draftId}/preview`)
          .set(MOCK_USER_HEADER, sellerId)
          .expect(200);

        const stored = await prisma.auction.findUniqueOrThrow({
          where: { id: draftId },
          select: { status: true, publishedAt: true }
        });
        expect(stored).toMatchObject({ status: 'DRAFT', publishedAt: null });
      });

      it('hides the preview of a draft owned by somebody else', async () => {
        const draftId = await createDraft();

        return request(app.getHttpServer())
          .get(`/auctions/drafts/${draftId}/preview`)
          .set(MOCK_USER_HEADER, strangerId)
          .expect(404);
      });
    });

    describe('POST /auctions/drafts/:id/publish', () => {
      it('publishes a future-dated draft as SCHEDULED', async () => {
        const draftId = await createDraft({
          scheduledStartAt: hoursFromNow(1),
          scheduledEndAt: hoursFromNow(4)
        });

        const response = await request(app.getHttpServer())
          .post(`/auctions/drafts/${draftId}/publish`)
          .set(MOCK_USER_HEADER, sellerId)
          .expect(200);

        expect(response.body).toMatchObject({
          id: draftId,
          status: 'SCHEDULED',
          startedAt: null
        });
        expect(
          (response.body as { publishedAt: string }).publishedAt
        ).not.toBeNull();
      });

      it('publishes a draft whose start time has arrived as ACTIVE', async () => {
        const draftId = await createDraft({
          scheduledStartAt: hoursFromNow(-1),
          scheduledEndAt: hoursFromNow(4)
        });

        const response = await request(app.getHttpServer())
          .post(`/auctions/drafts/${draftId}/publish`)
          .set(MOCK_USER_HEADER, sellerId)
          .expect(200);

        expect(response.body).toMatchObject({ status: 'ACTIVE' });
        expect(
          (response.body as { startedAt: string }).startedAt
        ).not.toBeNull();
      });

      it('records PUBLISHED for a scheduled auction and adds STARTED for a live one', async () => {
        const scheduledId = await createDraft({
          scheduledStartAt: hoursFromNow(1),
          scheduledEndAt: hoursFromNow(4)
        });
        const liveId = await createDraft({
          scheduledStartAt: hoursFromNow(-1),
          scheduledEndAt: hoursFromNow(4)
        });

        for (const id of [scheduledId, liveId]) {
          await request(app.getHttpServer())
            .post(`/auctions/drafts/${id}/publish`)
            .set(MOCK_USER_HEADER, sellerId)
            .expect(200);
        }

        const eventsOf = async (auctionId: string) =>
          (
            await prisma.auctionEvent.findMany({
              where: { auctionId },
              orderBy: { id: 'asc' },
              select: { eventType: true }
            })
          ).map((event) => event.eventType);

        expect(await eventsOf(scheduledId)).toEqual(['CREATED', 'PUBLISHED']);
        expect(await eventsOf(liveId)).toEqual([
          'CREATED',
          'PUBLISHED',
          'STARTED'
        ]);
      });

      it('refuses a draft that has not passed validation, listing what is missing', async () => {
        const { imageUrls, ...rest } = draftBody();
        void imageUrls;

        const created = await request(app.getHttpServer())
          .post('/auctions/drafts')
          .set(MOCK_USER_HEADER, sellerId)
          .send({
            ...rest,
            scheduledStartAt: hoursFromNow(1),
            scheduledEndAt: hoursFromNow(4)
          })
          .expect(201);
        const draftId = (created.body as { id: string }).id;

        const response = await request(app.getHttpServer())
          .post(`/auctions/drafts/${draftId}/publish`)
          .set(MOCK_USER_HEADER, sellerId)
          .expect(400);

        const body = response.body as { issues: { code: string }[] };
        expect(body.issues.map((issue) => issue.code)).toContain(
          'IMAGES_REQUIRED'
        );

        const stored = await prisma.auction.findUniqueOrThrow({
          where: { id: draftId },
          select: { status: true }
        });
        expect(stored.status).toBe('DRAFT');
      });

      it('refuses a draft whose end time has already passed', async () => {
        const draftId = await createDraft({
          scheduledStartAt: hoursFromNow(-4),
          scheduledEndAt: hoursFromNow(-1)
        });

        const response = await request(app.getHttpServer())
          .post(`/auctions/drafts/${draftId}/publish`)
          .set(MOCK_USER_HEADER, sellerId)
          .expect(400);

        const body = response.body as { issues: { code: string }[] };
        expect(body.issues.map((issue) => issue.code)).toContain(
          'END_AT_IN_THE_PAST'
        );
      });

      it('refuses to publish the same draft twice', async () => {
        const draftId = await createDraft({
          scheduledStartAt: hoursFromNow(1),
          scheduledEndAt: hoursFromNow(4)
        });

        await request(app.getHttpServer())
          .post(`/auctions/drafts/${draftId}/publish`)
          .set(MOCK_USER_HEADER, sellerId)
          .expect(200);

        // the draft is no longer a DRAFT, so the second attempt cannot find it
        await request(app.getHttpServer())
          .post(`/auctions/drafts/${draftId}/publish`)
          .set(MOCK_USER_HEADER, sellerId)
          .expect(404);

        const events = await prisma.auctionEvent.findMany({
          where: { auctionId: draftId, eventType: 'PUBLISHED' }
        });
        expect(events).toHaveLength(1);
      });

      it('refuses a publish by anyone other than the owner', async () => {
        const draftId = await createDraft({
          scheduledStartAt: hoursFromNow(1),
          scheduledEndAt: hoursFromNow(4)
        });

        await request(app.getHttpServer())
          .post(`/auctions/drafts/${draftId}/publish`)
          .set(MOCK_USER_HEADER, strangerId)
          .expect(404);

        await request(app.getHttpServer())
          .post(`/auctions/drafts/${draftId}/publish`)
          .expect(401);
      });
    });
  });
});
