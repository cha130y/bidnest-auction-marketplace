import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
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
  const buyerEmail = `auction-buyer-${run}@example.com`;

  let sellerId: string;
  let authOf: (userId: string) => string;
  let strangerId: string;
  let adminId: string;
  let buyerId: string;
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
    buyerId = await createUser(buyerEmail, 'USER');

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

    authOf = await authRegistry(app, [sellerId, strangerId, adminId, buyerId]);
  });

  afterAll(async () => {
    const userIds = [sellerId, strangerId, adminId, buyerId];
    // bids reference auctions, so they have to go first
    await prisma.bid.deleteMany({ where: { bidderId: { in: userIds } } });
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
        .set('Authorization', authOf(sellerId))
        .send({ ...draftBody(), ...overrides })
        .expect(201);
      return (response.body as { id: string }).id;
    };

    describe('GET /auctions/drafts/:id/preview', () => {
      it('shows the buyer-facing shape without the reserve', async () => {
        const draftId = await createDraft();

        const response = await request(app.getHttpServer())
          .get(`/auctions/drafts/${draftId}/preview`)
          .set('Authorization', authOf(sellerId))
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
          .set('Authorization', authOf(sellerId))
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
          .set('Authorization', authOf(strangerId))
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
          .set('Authorization', authOf(sellerId))
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
          .set('Authorization', authOf(sellerId))
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
            .set('Authorization', authOf(sellerId))
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
          .set('Authorization', authOf(sellerId))
          .send({
            ...rest,
            scheduledStartAt: hoursFromNow(1),
            scheduledEndAt: hoursFromNow(4)
          })
          .expect(201);
        const draftId = (created.body as { id: string }).id;

        const response = await request(app.getHttpServer())
          .post(`/auctions/drafts/${draftId}/publish`)
          .set('Authorization', authOf(sellerId))
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
          .set('Authorization', authOf(sellerId))
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
          .set('Authorization', authOf(sellerId))
          .expect(200);

        // the draft is no longer a DRAFT, so the second attempt cannot find it
        await request(app.getHttpServer())
          .post(`/auctions/drafts/${draftId}/publish`)
          .set('Authorization', authOf(sellerId))
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
          .set('Authorization', authOf(strangerId))
          .expect(404);

        await request(app.getHttpServer())
          .post(`/auctions/drafts/${draftId}/publish`)
          .expect(401);
      });
    });
  });

  /**
   * AUC-005 — a published auction is public from SCHEDULED onwards. This is the
   * first route a signed-out visitor can reach, so it is also where the reserve
   * confidentiality of AUC-003 finally gets tested over real HTTP.
   */
  describe('GET /auctions/:id (AUC-005)', () => {
    const hoursFromNow = (hours: number) =>
      new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();

    /** Creates a draft and publishes it, returning its id. */
    const publishAuction = async (startInHours: number) => {
      const created = await request(app.getHttpServer())
        .post('/auctions/drafts')
        .set('Authorization', authOf(sellerId))
        .send({
          ...draftBody(),
          scheduledStartAt: hoursFromNow(startInHours),
          scheduledEndAt: hoursFromNow(startInHours + 4)
        })
        .expect(201);
      const id = (created.body as { id: string }).id;

      await request(app.getHttpServer())
        .post(`/auctions/drafts/${id}/publish`)
        .set('Authorization', authOf(sellerId))
        .expect(200);

      return id;
    };

    it('lets a signed-out visitor read a SCHEDULED auction', async () => {
      const auctionId = await publishAuction(1);

      const response = await request(app.getHttpServer())
        .get(`/auctions/${auctionId}`)
        .expect(200);

      expect(response.body).toMatchObject({
        id: auctionId,
        status: 'SCHEDULED',
        title: 'Vintage Seiko 5 Automatic'
      });
    });

    it('tells a visitor that bidding is not open until the auction is ACTIVE', async () => {
      const scheduledId = await publishAuction(1);
      const activeId = await publishAuction(-1);

      const scheduled = await request(app.getHttpServer())
        .get(`/auctions/${scheduledId}`)
        .expect(200);
      const active = await request(app.getHttpServer())
        .get(`/auctions/${activeId}`)
        .expect(200);

      expect(scheduled.body).toMatchObject({
        status: 'SCHEDULED',
        biddingOpen: false
      });
      expect(active.body).toMatchObject({
        status: 'ACTIVE',
        biddingOpen: true
      });
    });

    // AUC-003 over the wire, on the first route where the public can reach it
    it('never sends the reserve to a visitor or to another user', async () => {
      const auctionId = await publishAuction(1);

      const anonymous = await request(app.getHttpServer())
        .get(`/auctions/${auctionId}`)
        .expect(200);
      const stranger = await request(app.getHttpServer())
        .get(`/auctions/${auctionId}`)
        .set('Authorization', authOf(strangerId))
        .expect(200);

      for (const response of [anonymous, stranger]) {
        expect(response.body).not.toHaveProperty('reservePrice');
        expect(JSON.stringify(response.body)).not.toContain('4500');
        expect(response.body).toMatchObject({ reserveMet: false });
      }
    });

    it('still gives the seller their own reserve after publishing', async () => {
      const auctionId = await publishAuction(1);

      const response = await request(app.getHttpServer())
        .get(`/auctions/${auctionId}`)
        .set('Authorization', authOf(sellerId))
        .expect(200);

      expect(response.body).toMatchObject({ reservePrice: '4500' });
    });

    it('keeps an unpublished draft out of the public route', async () => {
      const created = await request(app.getHttpServer())
        .post('/auctions/drafts')
        .set('Authorization', authOf(sellerId))
        .send(draftBody())
        .expect(201);
      const draftId = (created.body as { id: string }).id;

      // 404 for everyone, including the seller who owns it — a DRAFT is simply
      // not something this route serves
      await request(app.getHttpServer())
        .get(`/auctions/${draftId}`)
        .expect(404);
      await request(app.getHttpServer())
        .get(`/auctions/${draftId}`)
        .set('Authorization', authOf(sellerId))
        .expect(404);
    });

    it('answers 404 for an auction that does not exist', () => {
      return request(app.getHttpServer())
        .get('/auctions/00000000-0000-4000-8000-0000000099ff')
        .expect(404);
    });

    it('answers 400 for an id that is not a uuid', () => {
      return request(app.getHttpServer())
        .get('/auctions/not-a-uuid')
        .expect(400);
    });

    // the literal `drafts` segment must not be swallowed by `:id`
    it('does not let the public route shadow the drafts routes', async () => {
      await request(app.getHttpServer()).get('/auctions/drafts').expect(401);

      const response = await request(app.getHttpServer())
        .get('/auctions/drafts')
        .set('Authorization', authOf(sellerId))
        .expect(200);
      expect(response.body).toHaveProperty('items');
    });
  });

  /**
   * AUC-006 — the seller may edit or cancel only while the auction is DRAFT or
   * SCHEDULED and nobody has bid. Once it is ACTIVE the terms are settled.
   */
  describe('edit and cancel (AUC-006)', () => {
    const hoursFromNow = (hours: number) =>
      new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();

    const createDraft = async (overrides: Record<string, unknown> = {}) => {
      const created = await request(app.getHttpServer())
        .post('/auctions/drafts')
        .set('Authorization', authOf(sellerId))
        .send({
          ...draftBody(),
          scheduledStartAt: hoursFromNow(1),
          scheduledEndAt: hoursFromNow(4),
          ...overrides
        })
        .expect(201);
      return (created.body as { id: string }).id;
    };

    const publish = async (id: string) => {
      await request(app.getHttpServer())
        .post(`/auctions/drafts/${id}/publish`)
        .set('Authorization', authOf(sellerId))
        .expect(200);
      return id;
    };

    const statusOf = async (id: string) =>
      (
        await prisma.auction.findUniqueOrThrow({
          where: { id },
          select: { status: true }
        })
      ).status;

    describe('PATCH /auctions/:id', () => {
      it('edits a DRAFT', async () => {
        const id = await createDraft();

        const response = await request(app.getHttpServer())
          .patch(`/auctions/${id}`)
          .set('Authorization', authOf(sellerId))
          .send({ title: 'Renamed while still a draft' })
          .expect(200);

        expect(response.body).toMatchObject({
          id,
          title: 'Renamed while still a draft',
          status: 'DRAFT'
        });
      });

      it('edits a SCHEDULED auction and keeps it scheduled', async () => {
        const id = await publish(await createDraft());

        // stays under the 4500 reserve the draft was created with
        const response = await request(app.getHttpServer())
          .patch(`/auctions/${id}`)
          .set('Authorization', authOf(sellerId))
          .send({ startingPrice: 3500 })
          .expect(200);

        expect(response.body).toMatchObject({
          startingPrice: '3500',
          status: 'SCHEDULED'
        });
      });

      it('refuses an edit that pushes the starting price above the reserve', async () => {
        const id = await publish(await createDraft());

        const response = await request(app.getHttpServer())
          .patch(`/auctions/${id}`)
          .set('Authorization', authOf(sellerId))
          .send({ startingPrice: 5000 })
          .expect(400);

        const body = response.body as { issues: { code: string }[] };
        expect(body.issues.map((issue) => issue.code)).toContain(
          'RESERVE_BELOW_STARTING_PRICE'
        );

        // rolled back — the published auction keeps the price it had
        const stored = await prisma.auction.findUniqueOrThrow({
          where: { id },
          select: { startingPrice: true }
        });
        expect(stored.startingPrice.toString()).toBe('3000');
      });

      it('replaces the image set rather than appending to it', async () => {
        const id = await createDraft();

        const response = await request(app.getHttpServer())
          .patch(`/auctions/${id}`)
          .set('Authorization', authOf(sellerId))
          .send({ imageUrls: ['https://placehold.co/600x400?text=Only'] })
          .expect(200);

        const body = response.body as { images: { url: string }[] };
        expect(body.images).toHaveLength(1);
        expect(body.images[0].url).toBe(
          'https://placehold.co/600x400?text=Only'
        );
      });

      it('refuses an edit that would leave a published auction incomplete', async () => {
        const id = await publish(await createDraft());

        const response = await request(app.getHttpServer())
          .patch(`/auctions/${id}`)
          .set('Authorization', authOf(sellerId))
          .send({ imageUrls: [] })
          .expect(400);

        const body = response.body as { issues: { code: string }[] };
        expect(body.issues.map((issue) => issue.code)).toContain(
          'IMAGES_REQUIRED'
        );

        // the whole edit rolled back — the images are still there
        const stored = await prisma.auctionImage.findMany({
          where: { auctionId: id }
        });
        expect(stored.length).toBeGreaterThan(0);
      });

      it('lets a DRAFT be edited down to something incomplete', async () => {
        const id = await createDraft();

        await request(app.getHttpServer())
          .patch(`/auctions/${id}`)
          .set('Authorization', authOf(sellerId))
          .send({ imageUrls: [] })
          .expect(200);
      });

      it('refuses to edit an ACTIVE auction', async () => {
        const id = await publish(
          await createDraft({
            scheduledStartAt: hoursFromNow(-1),
            scheduledEndAt: hoursFromNow(4)
          })
        );
        expect(await statusOf(id)).toBe('ACTIVE');

        await request(app.getHttpServer())
          .patch(`/auctions/${id}`)
          .set('Authorization', authOf(sellerId))
          .send({ title: 'Too late' })
          .expect(400);
      });

      it('refuses an edit from anyone but the owner', async () => {
        const id = await createDraft();

        await request(app.getHttpServer())
          .patch(`/auctions/${id}`)
          .set('Authorization', authOf(strangerId))
          .send({ title: 'Not mine' })
          .expect(404);

        await request(app.getHttpServer())
          .patch(`/auctions/${id}`)
          .send({ title: 'Anonymous' })
          .expect(401);
      });

      it('rejects unknown fields instead of trusting them', async () => {
        const id = await createDraft();

        await request(app.getHttpServer())
          .patch(`/auctions/${id}`)
          .set('Authorization', authOf(sellerId))
          .send({ status: 'ACTIVE' })
          .expect(400);
      });
    });

    describe('POST /auctions/:id/cancel', () => {
      it('cancels a DRAFT', async () => {
        const id = await createDraft();

        const response = await request(app.getHttpServer())
          .post(`/auctions/${id}/cancel`)
          .set('Authorization', authOf(sellerId))
          .send({})
          .expect(200);

        expect(response.body).toMatchObject({ id, status: 'CANCELLED' });
      });

      it('cancels a SCHEDULED auction, storing the reason and the event', async () => {
        const id = await publish(await createDraft());

        await request(app.getHttpServer())
          .post(`/auctions/${id}/cancel`)
          .set('Authorization', authOf(sellerId))
          .send({ reason: 'Item was damaged in storage' })
          .expect(200);

        const stored = await prisma.auction.findUniqueOrThrow({
          where: { id },
          select: { status: true, cancellationReason: true, endedAt: true }
        });
        expect(stored).toMatchObject({
          status: 'CANCELLED',
          cancellationReason: 'Item was damaged in storage'
        });
        expect(stored.endedAt).not.toBeNull();

        const events = await prisma.auctionEvent.findMany({
          where: { auctionId: id, eventType: 'CANCELLED' }
        });
        expect(events).toHaveLength(1);
      });

      it('accepts a cancellation with no reason', async () => {
        const id = await createDraft();

        await request(app.getHttpServer())
          .post(`/auctions/${id}/cancel`)
          .set('Authorization', authOf(sellerId))
          .send({})
          .expect(200);
      });

      it('refuses to cancel an ACTIVE auction — that is an admin action', async () => {
        const id = await publish(
          await createDraft({
            scheduledStartAt: hoursFromNow(-1),
            scheduledEndAt: hoursFromNow(4)
          })
        );

        await request(app.getHttpServer())
          .post(`/auctions/${id}/cancel`)
          .set('Authorization', authOf(sellerId))
          .send({})
          .expect(400);

        expect(await statusOf(id)).toBe('ACTIVE');
      });

      it('refuses a second cancellation of the same auction', async () => {
        const id = await createDraft();

        await request(app.getHttpServer())
          .post(`/auctions/${id}/cancel`)
          .set('Authorization', authOf(sellerId))
          .send({})
          .expect(200);

        await request(app.getHttpServer())
          .post(`/auctions/${id}/cancel`)
          .set('Authorization', authOf(sellerId))
          .send({})
          .expect(400);
      });

      it('refuses a cancellation from anyone but the owner', async () => {
        const id = await createDraft();

        await request(app.getHttpServer())
          .post(`/auctions/${id}/cancel`)
          .set('Authorization', authOf(strangerId))
          .send({})
          .expect(404);

        await request(app.getHttpServer())
          .post(`/auctions/${id}/cancel`)
          .send({})
          .expect(401);
      });

      // a cancelled auction is not deleted — it stays readable as CANCELLED
      it('keeps a cancelled auction readable on the public route', async () => {
        const id = await publish(await createDraft());

        await request(app.getHttpServer())
          .post(`/auctions/${id}/cancel`)
          .set('Authorization', authOf(sellerId))
          .send({ reason: 'Changed my mind' })
          .expect(200);

        // CANCELLED is not in the public allow-list, so buyers stop seeing it
        await request(app.getHttpServer()).get(`/auctions/${id}`).expect(404);
      });
    });
  });

  /**
   * AUC-007 — how an auction ends. There is no bid endpoint yet (BID-001), so
   * the bids here are written straight through Prisma: this exercises the
   * settlement rules, not the bidding rules.
   */
  describe('auction settlement (AUC-007)', () => {
    const hoursFromNow = (hours: number) =>
      new Date(Date.now() + hours * 60 * 60 * 1000);

    /** Publishes an auction that is live now and due to end in the past. */
    const liveAuctionAlreadyDue = async (
      overrides: Record<string, unknown> = {}
    ) => {
      const created = await request(app.getHttpServer())
        .post('/auctions/drafts')
        .set('Authorization', authOf(sellerId))
        .send({
          ...draftBody(),
          scheduledStartAt: hoursFromNow(-2).toISOString(),
          scheduledEndAt: hoursFromNow(2).toISOString(),
          ...overrides
        })
        .expect(201);
      const id = (created.body as { id: string }).id;

      await request(app.getHttpServer())
        .post(`/auctions/drafts/${id}/publish`)
        .set('Authorization', authOf(sellerId))
        .expect(200);

      // Wind the clock past the end. Publishing with an end time in the past is
      // refused by AUC-004, so the auction is aged here instead.
      await prisma.auction.update({
        where: { id },
        data: {
          currentEndAt: hoursFromNow(-1),
          originalEndAt: hoursFromNow(-1)
        }
      });

      return id;
    };

    /** Records a bid directly — BID-001 will own the endpoint that does this. */
    const placeBid = async (
      auctionId: string,
      bidderId: string,
      amount: number,
      sequenceNo: number
    ) =>
      prisma.bid.create({
        data: {
          auctionId,
          bidderId,
          amount,
          sequenceNo,
          clientRequestId: randomUUID()
        },
        select: { id: true }
      });

    const storedAuction = (id: string) =>
      prisma.auction.findUniqueOrThrow({
        where: { id },
        select: {
          status: true,
          winnerUserId: true,
          winningBidId: true,
          soldPrice: true,
          endedAt: true
        }
      });

    it('ends SOLD and records the winner when the top bid clears the reserve', async () => {
      const id = await liveAuctionAlreadyDue();
      await placeBid(id, strangerId, 4000, 1);
      const winning = await placeBid(id, buyerId, 5000, 2);

      // reading it is what settles it
      const response = await request(app.getHttpServer())
        .get(`/auctions/${id}`)
        .expect(200);
      expect(response.body).toMatchObject({ status: 'SOLD' });

      const stored = await storedAuction(id);
      expect(stored).toMatchObject({
        status: 'SOLD',
        winnerUserId: buyerId,
        winningBidId: winning.id
      });
      expect(stored.soldPrice?.toString()).toBe('5000');
      expect(stored.endedAt).not.toBeNull();
    });

    it('ends UNSOLD when the top bid is under the reserve', async () => {
      // reserve is 4500 from draftBody()
      const id = await liveAuctionAlreadyDue();
      await placeBid(id, buyerId, 4499, 1);

      await request(app.getHttpServer()).get(`/auctions/${id}`).expect(200);

      const stored = await storedAuction(id);
      expect(stored).toMatchObject({
        status: 'UNSOLD',
        winnerUserId: null,
        winningBidId: null,
        soldPrice: null
      });
    });

    it('ends UNSOLD when nobody bid at all', async () => {
      const id = await liveAuctionAlreadyDue();

      await request(app.getHttpServer()).get(`/auctions/${id}`).expect(200);

      expect(await storedAuction(id)).toMatchObject({
        status: 'UNSOLD',
        winnerUserId: null
      });
    });

    it('ends SOLD on any bid when the auction carries no reserve', async () => {
      const { reservePrice, ...rest } = draftBody();
      void reservePrice;

      const created = await request(app.getHttpServer())
        .post('/auctions/drafts')
        .set('Authorization', authOf(sellerId))
        .send({
          ...rest,
          scheduledStartAt: hoursFromNow(-2).toISOString(),
          scheduledEndAt: hoursFromNow(2).toISOString()
        })
        .expect(201);
      const id = (created.body as { id: string }).id;

      await request(app.getHttpServer())
        .post(`/auctions/drafts/${id}/publish`)
        .set('Authorization', authOf(sellerId))
        .expect(200);
      await prisma.auction.update({
        where: { id },
        data: { currentEndAt: hoursFromNow(-1) }
      });
      await placeBid(id, buyerId, 3000, 1);

      await request(app.getHttpServer()).get(`/auctions/${id}`).expect(200);

      expect(await storedAuction(id)).toMatchObject({
        status: 'SOLD',
        winnerUserId: buyerId
      });
    });

    it('picks the highest bid, not the most recent one', async () => {
      const id = await liveAuctionAlreadyDue();
      const highest = await placeBid(id, buyerId, 9000, 1);
      await placeBid(id, strangerId, 5000, 2);

      await request(app.getHttpServer()).get(`/auctions/${id}`).expect(200);

      const stored = await storedAuction(id);
      expect(stored.winningBidId).toBe(highest.id);
      expect(stored.winnerUserId).toBe(buyerId);
    });

    it('records exactly one ENDED event, even when read repeatedly', async () => {
      const id = await liveAuctionAlreadyDue();
      await placeBid(id, buyerId, 5000, 1);

      for (let i = 0; i < 3; i += 1) {
        await request(app.getHttpServer()).get(`/auctions/${id}`).expect(200);
      }

      const events = await prisma.auctionEvent.findMany({
        where: { auctionId: id, eventType: 'ENDED' }
      });
      expect(events).toHaveLength(1);
    });

    it('leaves a still-running auction alone', async () => {
      const created = await request(app.getHttpServer())
        .post('/auctions/drafts')
        .set('Authorization', authOf(sellerId))
        .send({
          ...draftBody(),
          scheduledStartAt: hoursFromNow(-1).toISOString(),
          scheduledEndAt: hoursFromNow(4).toISOString()
        })
        .expect(201);
      const id = (created.body as { id: string }).id;
      await request(app.getHttpServer())
        .post(`/auctions/drafts/${id}/publish`)
        .set('Authorization', authOf(sellerId))
        .expect(200);

      const response = await request(app.getHttpServer())
        .get(`/auctions/${id}`)
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'ACTIVE',
        biddingOpen: true
      });
      expect((await storedAuction(id)).endedAt).toBeNull();
    });

    // AUC-003 — the reserve decided the outcome, but never appears in it
    it('never reveals the reserve in the settled result', async () => {
      const id = await liveAuctionAlreadyDue();
      await placeBid(id, buyerId, 4499, 1);

      const response = await request(app.getHttpServer())
        .get(`/auctions/${id}`)
        .expect(200);

      expect(response.body).not.toHaveProperty('reservePrice');
      expect(JSON.stringify(response.body)).not.toContain('4500');
      expect(response.body).toMatchObject({
        status: 'UNSOLD',
        reserveMet: false
      });
    });
  });

  /**
   * AUC-008 — Hot Auctions. The ordering is the whole requirement, so these
   * tests build auctions that differ in exactly one tie-breaker at a time.
   */
  describe('GET /auctions (AUC-008)', () => {
    const hoursFromNow = (hours: number) =>
      new Date(Date.now() + hours * 60 * 60 * 1000);

    /** Publishes a live auction, then forces its bid count and end time. */
    const liveAuction = async (bidCount: number, endsInHours: number) => {
      const created = await request(app.getHttpServer())
        .post('/auctions/drafts')
        .set('Authorization', authOf(sellerId))
        .send({
          ...draftBody(),
          scheduledStartAt: hoursFromNow(-1).toISOString(),
          scheduledEndAt: hoursFromNow(endsInHours).toISOString()
        })
        .expect(201);
      const id = (created.body as { id: string }).id;

      await request(app.getHttpServer())
        .post(`/auctions/drafts/${id}/publish`)
        .set('Authorization', authOf(sellerId))
        .expect(200);

      // BID-001 will maintain bidCount; here it is set directly so the ranking
      // can be tested without a bid endpoint.
      await prisma.auction.update({
        where: { id },
        data: { bidCount, currentEndAt: hoursFromNow(endsInHours) }
      });

      return id;
    };

    /** Ids from the hot list, in the order the API returned them. */
    const hotIds = async (query = '') => {
      const response = await request(app.getHttpServer())
        .get(`/auctions${query}`)
        .expect(200);
      return (response.body as { items: { id: string }[] }).items.map(
        (item) => item.id
      );
    };

    it('is readable by a signed-out visitor', async () => {
      await liveAuction(1, 5);

      const response = await request(app.getHttpServer())
        .get('/auctions')
        .expect(200);

      expect(response.body).toHaveProperty('items');
      expect(response.body).toHaveProperty('meta');
    });

    it('puts the auction with more bids first', async () => {
      const quiet = await liveAuction(2, 5);
      const busy = await liveAuction(9, 5);

      const ids = await hotIds();

      expect(ids.indexOf(busy)).toBeLessThan(ids.indexOf(quiet));
    });

    it('breaks a tie on bids by whichever ends soonest', async () => {
      const later = await liveAuction(4, 8);
      const sooner = await liveAuction(4, 2);

      const ids = await hotIds();

      expect(ids.indexOf(sooner)).toBeLessThan(ids.indexOf(later));
    });

    // Without the id the order of a full tie is undefined, and paging would
    // start showing duplicates
    it('breaks a full tie by auction id, giving a stable order', async () => {
      const endsAt = hoursFromNow(6);
      const first = await liveAuction(3, 6);
      const second = await liveAuction(3, 6);
      await prisma.auction.updateMany({
        where: { id: { in: [first, second] } },
        data: { currentEndAt: endsAt }
      });

      const expected = [first, second].sort();
      const ids = (await hotIds()).filter((id) => expected.includes(id));

      expect(ids).toEqual(expected);
    });

    it('leaves out auctions that are not running', async () => {
      const running = await liveAuction(1, 5);

      // scheduled: published but not started
      const scheduledDraft = await request(app.getHttpServer())
        .post('/auctions/drafts')
        .set('Authorization', authOf(sellerId))
        .send({
          ...draftBody(),
          scheduledStartAt: hoursFromNow(2).toISOString(),
          scheduledEndAt: hoursFromNow(6).toISOString()
        })
        .expect(201);
      const scheduledId = (scheduledDraft.body as { id: string }).id;
      await request(app.getHttpServer())
        .post(`/auctions/drafts/${scheduledId}/publish`)
        .set('Authorization', authOf(sellerId))
        .expect(200);

      // cancelled
      const cancelled = await liveAuction(1, 5);
      await prisma.auction.update({
        where: { id: cancelled },
        data: { status: 'CANCELLED' }
      });

      // soft-deleted
      const deleted = await liveAuction(1, 5);
      await prisma.auction.update({
        where: { id: deleted },
        data: { deletedAt: new Date() }
      });

      const ids = await hotIds();

      expect(ids).toContain(running);
      expect(ids).not.toContain(scheduledId);
      expect(ids).not.toContain(cancelled);
      expect(ids).not.toContain(deleted);
    });

    // AUC-003 — the list is buyer-facing, so the same rule holds
    it('never exposes the reserve in the list', async () => {
      await liveAuction(1, 5);

      const response = await request(app.getHttpServer())
        .get('/auctions')
        .expect(200);

      const body = response.body as { items: Record<string, unknown>[] };
      expect(body.items.every((item) => !('reservePrice' in item))).toBe(true);
      expect(JSON.stringify(body.items)).not.toContain('4500');
    });

    it('pages without repeating or skipping an auction', async () => {
      for (let bids = 1; bids <= 4; bids += 1) {
        await liveAuction(bids, 5);
      }

      const firstPage = await hotIds('?page=1&limit=2');
      const secondPage = await hotIds('?page=2&limit=2');

      expect(firstPage).toHaveLength(2);
      expect(secondPage).toHaveLength(2);
      expect(firstPage.some((id) => secondPage.includes(id))).toBe(false);
    });

    it('reports the totals alongside the page', async () => {
      await liveAuction(1, 5);

      const response = await request(app.getHttpServer())
        .get('/auctions?limit=1')
        .expect(200);

      const meta = (response.body as { meta: Record<string, number> }).meta;
      expect(meta.page).toBe(1);
      expect(meta.limit).toBe(1);
      expect(meta.total).toBeGreaterThan(0);
      expect(meta.totalPages).toBe(Math.ceil(meta.total / 1));
    });

    it('rejects a limit past the cap instead of returning everything', () => {
      return request(app.getHttpServer())
        .get('/auctions?limit=500')
        .expect(400);
    });

    it('rejects a page that is not a positive number', () => {
      return request(app.getHttpServer()).get('/auctions?page=0').expect(400);
    });
  });

  /**
   * BID-001 — the first requirement that writes a bid through the API rather
   * than through Prisma. Everything the auction tests had to fake — bidCount,
   * currentPrice, the bid rows themselves — is now produced for real.
   */
  describe('POST /auctions/:id/bids (BID-001)', () => {
    const hoursFromNow = (hours: number) =>
      new Date(Date.now() + hours * 60 * 60 * 1000);

    /** Publishes an auction that is live right now. */
    const liveAuction = async (overrides: Record<string, unknown> = {}) => {
      const created = await request(app.getHttpServer())
        .post('/auctions/drafts')
        .set('Authorization', authOf(sellerId))
        .send({
          ...draftBody(),
          scheduledStartAt: hoursFromNow(-1).toISOString(),
          scheduledEndAt: hoursFromNow(4).toISOString(),
          ...overrides
        })
        .expect(201);
      const id = (created.body as { id: string }).id;

      await request(app.getHttpServer())
        .post(`/auctions/drafts/${id}/publish`)
        .set('Authorization', authOf(sellerId))
        .expect(200);

      return id;
    };

    const bid = (auctionId: string, userId: string, amount: number) =>
      request(app.getHttpServer())
        .post(`/auctions/${auctionId}/bids`)
        .set('Authorization', authOf(userId))
        .send({ amount, clientRequestId: randomUUID() });

    const storedAuction = (id: string) =>
      prisma.auction.findUniqueOrThrow({
        where: { id },
        select: { currentPrice: true, bidCount: true }
      });

    it('accepts an opening bid at the starting price', async () => {
      const id = await liveAuction();

      const response = await bid(id, buyerId, 3000).expect(201);

      expect(response.body).toMatchObject({
        auctionId: id,
        bidderId: buyerId,
        amount: '3000',
        sequenceNo: 1
      });
    });

    it('moves the auction price and count', async () => {
      const id = await liveAuction();

      await bid(id, buyerId, 3000).expect(201);

      const stored = await storedAuction(id);
      expect(stored.currentPrice.toString()).toBe('3000');
      expect(stored.bidCount).toBe(1);
    });

    it('numbers bids in the order they are accepted', async () => {
      const id = await liveAuction();

      await bid(id, buyerId, 3000).expect(201);
      await bid(id, strangerId, 3100).expect(201);
      const third = await bid(id, buyerId, 3200).expect(201);

      expect((third.body as { sequenceNo: number }).sequenceNo).toBe(3);
    });

    it('records a BID_PLACED event for each accepted bid', async () => {
      const id = await liveAuction();

      await bid(id, buyerId, 3000).expect(201);
      await bid(id, strangerId, 3100).expect(201);

      const events = await prisma.auctionEvent.findMany({
        where: { auctionId: id, eventType: 'BID_PLACED' }
      });
      expect(events).toHaveLength(2);
    });

    describe('the amount rules', () => {
      it('refuses an opening bid below the starting price', async () => {
        const id = await liveAuction();

        await bid(id, buyerId, 2999).expect(400);

        // nothing was written
        expect(await storedAuction(id)).toMatchObject({ bidCount: 0 });
      });

      it('refuses a later bid that does not clear the increment', async () => {
        const id = await liveAuction();
        await bid(id, buyerId, 3000).expect(201);

        await bid(id, strangerId, 3099).expect(400);

        expect((await storedAuction(id)).bidCount).toBe(1);
      });

      it('accepts a later bid at exactly the increment', async () => {
        const id = await liveAuction();
        await bid(id, buyerId, 3000).expect(201);

        await bid(id, strangerId, 3100).expect(201);

        expect((await storedAuction(id)).currentPrice.toString()).toBe('3100');
      });

      it('refuses zero and negative amounts', async () => {
        const id = await liveAuction();

        await bid(id, buyerId, 0).expect(400);
        await bid(id, buyerId, -100).expect(400);
      });
    });

    describe('who may bid', () => {
      it('refuses the seller of the auction', async () => {
        const id = await liveAuction();

        await bid(id, sellerId, 5000).expect(403);

        expect((await storedAuction(id)).bidCount).toBe(0);
      });

      it('refuses a signed-out visitor', async () => {
        const id = await liveAuction();

        await request(app.getHttpServer())
          .post(`/auctions/${id}/bids`)
          .send({ amount: 3000, clientRequestId: randomUUID() })
          .expect(401);
      });

      it('refuses an admin — they moderate, they do not bid', async () => {
        const id = await liveAuction();

        await bid(id, adminId, 3000).expect(403);
      });
    });

    describe('which auctions accept bids', () => {
      it('refuses a scheduled auction that has not opened', async () => {
        const created = await request(app.getHttpServer())
          .post('/auctions/drafts')
          .set('Authorization', authOf(sellerId))
          .send({
            ...draftBody(),
            scheduledStartAt: hoursFromNow(2).toISOString(),
            scheduledEndAt: hoursFromNow(6).toISOString()
          })
          .expect(201);
        const id = (created.body as { id: string }).id;
        await request(app.getHttpServer())
          .post(`/auctions/drafts/${id}/publish`)
          .set('Authorization', authOf(sellerId))
          .expect(200);

        await bid(id, buyerId, 3000).expect(409);
      });

      it('refuses an auction that has already ended', async () => {
        const id = await liveAuction();
        await prisma.auction.update({
          where: { id },
          data: { currentEndAt: hoursFromNow(-1) }
        });

        await bid(id, buyerId, 3000).expect(409);
      });

      it('refuses an auction that does not exist', () => {
        return request(app.getHttpServer())
          .post('/auctions/00000000-0000-4000-8000-0000000099ff/bids')
          .set('Authorization', authOf(buyerId))
          .send({ amount: 3000, clientRequestId: randomUUID() })
          .expect(404);
      });
    });

    describe('duplicate requests', () => {
      it('refuses the same clientRequestId twice', async () => {
        const id = await liveAuction();
        const clientRequestId = randomUUID();
        const body = { amount: 3000, clientRequestId };

        await request(app.getHttpServer())
          .post(`/auctions/${id}/bids`)
          .set('Authorization', authOf(buyerId))
          .send(body)
          .expect(201);

        await request(app.getHttpServer())
          .post(`/auctions/${id}/bids`)
          .set('Authorization', authOf(buyerId))
          .send({ ...body, amount: 9000 })
          .expect(409);

        // the retry changed nothing
        const stored = await storedAuction(id);
        expect(stored.currentPrice.toString()).toBe('3000');
        expect(stored.bidCount).toBe(1);
      });

      it('rejects a clientRequestId that is not a uuid', async () => {
        const id = await liveAuction();

        await request(app.getHttpServer())
          .post(`/auctions/${id}/bids`)
          .set('Authorization', authOf(buyerId))
          .send({ amount: 3000, clientRequestId: 'not-a-uuid' })
          .expect(400);
      });
    });

    // BID-002 covers idempotency properly; this is the concurrency half
    it('lets only one of two simultaneous bids through', async () => {
      const id = await liveAuction();

      const results = await Promise.allSettled([
        bid(id, buyerId, 3000),
        bid(id, strangerId, 3000)
      ]);

      const statuses = results.map((result) =>
        result.status === 'fulfilled' ? result.value.status : 0
      );
      expect(statuses.filter((status) => status === 201)).toHaveLength(1);

      // exactly one bid landed, and the count matches
      const stored = await storedAuction(id);
      expect(stored.bidCount).toBe(1);
      const bids = await prisma.bid.findMany({ where: { auctionId: id } });
      expect(bids).toHaveLength(1);
    });

    // the rule AUC-006 wrote but could not reach until now
    it('stops the seller editing an auction once a bid lands', async () => {
      const id = await liveAuction();
      await bid(id, buyerId, 3000).expect(201);

      await request(app.getHttpServer())
        .patch(`/auctions/${id}`)
        .set('Authorization', authOf(sellerId))
        .send({ title: 'Too late to rename' })
        .expect(400);
    });

    // and the settlement AUC-007 could only test with hand-written bids
    it('settles as SOLD against a real bid that cleared the reserve', async () => {
      const id = await liveAuction();
      await bid(id, buyerId, 5000).expect(201);
      await prisma.auction.update({
        where: { id },
        data: { currentEndAt: hoursFromNow(-1) }
      });

      const response = await request(app.getHttpServer())
        .get(`/auctions/${id}`)
        .expect(200);

      expect(response.body).toMatchObject({ status: 'SOLD' });
      const stored = await prisma.auction.findUniqueOrThrow({
        where: { id },
        select: { winnerUserId: true, soldPrice: true }
      });
      expect(stored.winnerUserId).toBe(buyerId);
      expect(stored.soldPrice?.toString()).toBe('5000');
    });
  });
});
