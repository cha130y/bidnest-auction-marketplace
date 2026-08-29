import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { authRegistry } from './helpers/auth';
import { expectNoReserve } from './helpers/reserve';
import { backdateSchedule } from './helpers/schedule';
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

  /**
   * Titles carry the run too, not just the emails and slugs. An auction row
   * that outlives its suite — a timeout skips afterAll — is otherwise
   * indistinguishable from real data, and cleaning one up means matching a
   * title that every run of every suite shares.
   */
  const auctionTitle = `Vintage Seiko 5 Automatic ${run}`;
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

  const daysFromNow = (days: number) =>
    new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

  /**
   * The schedule every draft in this suite is written with.
   *
   * Relative to the run rather than a date written down, because a schedule
   * may not be written into the past: a fixed date is accepted until the
   * morning it is not, and a suite that goes red on a particular day for a
   * reason nothing in it explains is worse than no suite. Resolved once, so
   * the draft that is created and the response asserted against it name the
   * same instant to the millisecond.
   */
  const DRAFT_START_AT = daysFromNow(1);
  const DRAFT_END_AT = daysFromNow(2);

  const draftBody = () => ({
    title: auctionTitle,
    description: 'Serviced last year, original bracelet.',
    categoryId: activeCategoryId,
    condition: 'USED',
    startingPrice: 3000,
    minBidIncrement: 100,
    reservePrice: 4500,
    scheduledStartAt: DRAFT_START_AT,
    scheduledEndAt: DRAFT_END_AT,
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
    // Listen once for the whole suite rather than leaving the server idle.
    // supertest opens an ephemeral listener per request against an idle
    // server and closes it again straight after; back-to-back requests can
    // then land on a socket whose listener is already going away.
    await app.listen(0);

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
    // extensions point at bids, and bids at auctions — unwind in that order
    await prisma.auctionExtension.deleteMany({
      where: { auction: { sellerId: { in: userIds } } }
    });
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
        title: auctionTitle,
        description: 'Serviced last year, original bracelet.',
        condition: 'USED',
        status: 'DRAFT',
        currency: 'THB',
        startingPrice: '3000',
        minBidIncrement: '100',
        reservePrice: '4500',
        scheduledStartAt: DRAFT_START_AT,
        originalEndAt: DRAFT_END_AT,
        currentEndAt: DRAFT_END_AT,
        category: { id: activeCategoryId },
        seller: { id: sellerId }
      });
      const body = response.body as { images: { id: unknown }[] };
      expect(body.images).toEqual([
        {
          // AUC-001 — the id is what lets a seller's screen name a picture to
          // remove, so it is asserted rather than allowed through: dropping it
          // from the mapper would leave the image manager unable to delete.
          id: expect.any(String) as unknown,
          url: 'https://placehold.co/600x400?text=Front',
          position: 0,
          isPrimary: true
        },
        {
          id: expect.any(String) as unknown,
          url: 'https://placehold.co/600x400?text=Back',
          position: 1,
          isPrimary: false
        }
      ]);
      expect(body.images[0].id).not.toEqual(body.images[1].id);
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
        scheduledStartAt: daysFromNow(4),
        scheduledEndAt: daysFromNow(3)
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
      expectNoReserve(validation, 4500);
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
        expectNoReserve(response.body, 4500);
        expect(response.body).toMatchObject({
          id: draftId,
          reserveMet: false,
          title: auctionTitle
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
          scheduledStartAt: hoursFromNow(1),
          scheduledEndAt: hoursFromNow(4)
        });
        // The start arrives while the draft waits. A seller cannot write a
        // time that has already gone by, so the fixture ages instead — which
        // is how an auction reaches its own start time anyway.
        await backdateSchedule(prisma, draftId, {
          startAt: new Date(hoursFromNow(-1)),
          endAt: new Date(hoursFromNow(4))
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
          scheduledStartAt: hoursFromNow(1),
          scheduledEndAt: hoursFromNow(4)
        });
        await backdateSchedule(prisma, liveId, {
          startAt: new Date(hoursFromNow(-1)),
          endAt: new Date(hoursFromNow(4))
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
          scheduledStartAt: hoursFromNow(1),
          scheduledEndAt: hoursFromNow(4)
        });
        await backdateSchedule(prisma, draftId, {
          startAt: new Date(hoursFromNow(-4)),
          endAt: new Date(hoursFromNow(-1))
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

    /**
     * Creates a draft and publishes it, returning its id.
     *
     * A negative `startInHours` asks for an auction that is already running.
     * The draft is still written with a schedule in the future, because
     * AUC-001 refuses one that is not, and is then aged into place.
     */
    const publishAuction = async (startInHours: number) => {
      const writable = Math.max(startInHours, 1);
      const created = await request(app.getHttpServer())
        .post('/auctions/drafts')
        .set('Authorization', authOf(sellerId))
        .send({
          ...draftBody(),
          scheduledStartAt: hoursFromNow(writable),
          scheduledEndAt: hoursFromNow(writable + 4)
        })
        .expect(201);
      const id = (created.body as { id: string }).id;

      if (startInHours < 0) {
        await backdateSchedule(prisma, id, {
          startAt: new Date(hoursFromNow(startInHours)),
          endAt: new Date(hoursFromNow(startInHours + 4))
        });
      }

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
        title: auctionTitle
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
        expectNoReserve(response.body, 4500);
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
        const draftId = await createDraft({
          scheduledStartAt: hoursFromNow(1),
          scheduledEndAt: hoursFromNow(4)
        });
        await backdateSchedule(prisma, draftId, {
          startAt: new Date(hoursFromNow(-1)),
          endAt: new Date(hoursFromNow(4))
        });
        const id = await publish(draftId);
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
        const draftId = await createDraft({
          scheduledStartAt: hoursFromNow(1),
          scheduledEndAt: hoursFromNow(4)
        });
        await backdateSchedule(prisma, draftId, {
          startAt: new Date(hoursFromNow(-1)),
          endAt: new Date(hoursFromNow(4))
        });
        const id = await publish(draftId);

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
          scheduledStartAt: hoursFromNow(1).toISOString(),
          scheduledEndAt: hoursFromNow(5).toISOString(),
          ...overrides
        })
        .expect(201);
      const id = (created.body as { id: string }).id;

      // A seller cannot write a start that has already gone by, so the draft
      // is aged into place instead — which is how it reaches its start time.
      await backdateSchedule(prisma, id, {
        startAt: hoursFromNow(-2),
        endAt: hoursFromNow(2)
      });

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
          scheduledStartAt: hoursFromNow(1).toISOString(),
          scheduledEndAt: hoursFromNow(5).toISOString()
        })
        .expect(201);
      const id = (created.body as { id: string }).id;

      // A seller cannot write a start that has already gone by, so the draft
      // is aged into place instead — which is how it reaches its start time.
      await backdateSchedule(prisma, id, {
        startAt: hoursFromNow(-2),
        endAt: hoursFromNow(2)
      });

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
          scheduledStartAt: hoursFromNow(1).toISOString(),
          scheduledEndAt: hoursFromNow(5).toISOString()
        })
        .expect(201);
      const id = (created.body as { id: string }).id;

      // A seller cannot write a start that has already gone by, so the draft
      // is aged into place instead — which is how it reaches its start time.
      await backdateSchedule(prisma, id, {
        startAt: hoursFromNow(-1),
        endAt: hoursFromNow(4)
      });

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
      expectNoReserve(response.body, 4500);
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
          scheduledStartAt: hoursFromNow(1).toISOString(),
          scheduledEndAt: hoursFromNow(endsInHours + 2).toISOString()
        })
        .expect(201);
      const id = (created.body as { id: string }).id;

      // A seller cannot write a start that has already gone by, so the draft
      // is aged into place instead — which is how it reaches its start time.
      await backdateSchedule(prisma, id, {
        startAt: hoursFromNow(-1),
        endAt: hoursFromNow(endsInHours)
      });

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

    type HotPage = {
      items: { id: string }[];
      meta: { totalPages: number };
    };

    const hotPage = async (query: string) => {
      const response = await request(app.getHttpServer())
        .get(`/auctions${query}`)
        .expect(200);

      return response.body as HotPage;
    };

    /**
     * Every id on the hot list, in the order the API returned them.
     *
     * Reads all the pages rather than the first one. The list is shared with
     * every auction in the database — including whatever an earlier run left
     * behind when it timed out before its teardown — so a test looking for its
     * own auction on a single page fails once enough leftovers accumulate, for
     * reasons that have nothing to do with the ranking. Asking for a bigger
     * page only moves the number at which that happens: this suite has been
     * fixed twice that way already, at twenty and then at a hundred.
     *
     * The loop is bounded by the API's own `totalPages`, so it costs one
     * request on a clean database and cannot run away on a dirty one.
     *
     * A test that is specifically about paging passes its own query and gets
     * exactly the page it asked for.
     */
    const hotIds = async (query?: string) => {
      if (query) return (await hotPage(query)).items.map((item) => item.id);

      const first = await hotPage('?limit=100');
      const ids = first.items.map((item) => item.id);

      for (let page = 2; page <= first.meta.totalPages; page += 1) {
        const next = await hotPage(`?limit=100&page=${page}`);
        ids.push(...next.items.map((item) => item.id));
      }

      return ids;
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
      expectNoReserve(body.items, 4500);
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

    /**
     * The three sections beyond `hot` come from the home page design rather
     * than the SRS. These tests are about the two things a mocked query cannot
     * show: that the ordering holds against a real database, and that a
     * section never surfaces an auction the single read hides (AUC-005).
     */
    describe('sections', () => {
      /** Publishes an auction whose start is still ahead of it. */
      const scheduledAuction = async (startsInHours: number) => {
        const created = await request(app.getHttpServer())
          .post('/auctions/drafts')
          .set('Authorization', authOf(sellerId))
          .send({
            ...draftBody(),
            scheduledStartAt: hoursFromNow(startsInHours).toISOString(),
            scheduledEndAt: hoursFromNow(startsInHours + 4).toISOString()
          })
          .expect(201);
        const id = (created.body as { id: string }).id;

        await request(app.getHttpServer())
          .post(`/auctions/drafts/${id}/publish`)
          .set('Authorization', authOf(sellerId))
          .expect(200);

        return id;
      };

      /** A settled auction, with the outcome recorded however long ago. */
      const endedAuction = async (
        status: 'SOLD' | 'UNSOLD',
        endedHoursAgo: number
      ) => {
        const id = await liveAuction(1, 5);

        await prisma.auction.update({
          where: { id },
          data: { status, endedAt: hoursFromNow(-endedHoursAgo) }
        });

        return id;
      };

      /** Paged through for the reason hotIds explains. */
      const sectionIds = async (section: string) => {
        const first = await hotPage(`?limit=100&section=${section}`);
        const ids = first.items.map((item) => item.id);

        for (let page = 2; page <= first.meta.totalPages; page += 1) {
          const next = await hotPage(
            `?limit=100&page=${page}&section=${section}`
          );
          ids.push(...next.items.map((item) => item.id));
        }

        return ids;
      };

      const SECTIONS = [
        'hot',
        'ending-soon',
        'starting-soon',
        'recently-ended'
      ];

      /**
       * The one test that proves a section reaches the database at all: the
       * same two auctions come back in opposite orders, because hot ranks by
       * bidding and ending-soon ranks by the clock.
       */
      it('orders ending-soon by the clock, not by the bidding', async () => {
        const busyButLater = await liveAuction(9, 8);
        const quietButSooner = await liveAuction(1, 2);

        const hot = await hotIds();
        const ending = await sectionIds('ending-soon');

        expect(hot.indexOf(busyButLater)).toBeLessThan(
          hot.indexOf(quietButSooner)
        );
        expect(ending.indexOf(quietButSooner)).toBeLessThan(
          ending.indexOf(busyButLater)
        );
      });

      it('lists starting-soon from the scheduled ones, soonest first', async () => {
        const later = await scheduledAuction(9);
        const sooner = await scheduledAuction(2);
        const running = await liveAuction(1, 5);

        const ids = await sectionIds('starting-soon');

        expect(ids.indexOf(sooner)).toBeLessThan(ids.indexOf(later));
        expect(ids).not.toContain(running);
      });

      it('lists recently-ended newest first, whether sold or not', async () => {
        const older = await endedAuction('SOLD', 6);
        const newer = await endedAuction('UNSOLD', 1);
        const running = await liveAuction(1, 5);

        const ids = await sectionIds('recently-ended');

        expect(ids.indexOf(newer)).toBeLessThan(ids.indexOf(older));
        expect(ids).not.toContain(running);
      });

      /**
       * AUC-005 — CANCELLED is not a public status, so an auction an admin or
       * a seller withdrew must not reappear as a result. This is the section
       * most likely to get it wrong, because it is the one that looks for
       * auctions that are over.
       */
      it('keeps a cancelled auction out of recently-ended', async () => {
        const cancelled = await liveAuction(1, 5);
        await prisma.auction.update({
          where: { id: cancelled },
          data: {
            status: 'CANCELLED',
            endedAt: new Date(),
            cancellationReason: 'Item no longer available'
          }
        });

        const ids = await sectionIds('recently-ended');

        expect(ids).not.toContain(cancelled);
      });

      it.each(SECTIONS)(
        'hides a soft-deleted auction from %s',
        async (section) => {
          const deleted =
            section === 'starting-soon'
              ? await scheduledAuction(3)
              : section === 'recently-ended'
                ? await endedAuction('SOLD', 1)
                : await liveAuction(1, 5);

          await prisma.auction.update({
            where: { id: deleted },
            data: { deletedAt: new Date() }
          });

          expect(await sectionIds(section)).not.toContain(deleted);
        }
      );

      // AUC-003 — every section is buyer-facing, so the same rule holds
      it.each(SECTIONS)(
        'never exposes the reserve through %s',
        async (section) => {
          await liveAuction(1, 5);
          await scheduledAuction(3);
          await endedAuction('SOLD', 1);

          const response = await request(app.getHttpServer())
            .get(`/auctions?section=${section}`)
            .expect(200);

          const body = response.body as { items: Record<string, unknown>[] };
          expect(body.items.every((item) => !('reservePrice' in item))).toBe(
            true
          );
          expectNoReserve(body.items, 4500);
        }
      );

      /**
       * The totals have to describe the section, not the table. A count taken
       * from the wrong filter is the failure that makes a "12 starting soon"
       * label lie without anything looking broken.
       */
      it('counts the section rather than everything public', async () => {
        await scheduledAuction(3);
        await liveAuction(1, 5);

        const response = await request(app.getHttpServer())
          .get('/auctions?section=starting-soon&limit=1')
          .expect(200);

        const meta = (response.body as { meta: { total: number } }).meta;
        const scheduledInDatabase = await prisma.auction.count({
          where: { status: 'SCHEDULED', deletedAt: null }
        });

        expect(meta.total).toBe(scheduledInDatabase);
      });

      // a screen asking for a section that does not exist has a bug, and
      // answering it with the hot list would hide that
      it('rejects a section it does not have', () => {
        return request(app.getHttpServer())
          .get('/auctions?section=most-expensive')
          .expect(400);
      });

      it('still reads the hot list when no section is asked for', async () => {
        const running = await liveAuction(4, 5);
        const scheduled = await scheduledAuction(3);

        const ids = await hotIds();

        expect(ids).toContain(running);
        expect(ids).not.toContain(scheduled);
      });
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
          scheduledStartAt: hoursFromNow(1).toISOString(),
          scheduledEndAt: hoursFromNow(5).toISOString(),
          ...overrides
        })
        .expect(201);
      const id = (created.body as { id: string }).id;

      // A seller cannot write a start that has already gone by, so the draft
      // is aged into place instead — which is how it reaches its start time.
      await backdateSchedule(prisma, id, {
        startAt: hoursFromNow(-1),
        endAt: hoursFromNow(4)
      });

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

  /**
   * BID-002 — a retry is the same bid arriving twice and gets the same answer,
   * so a caller who never saw the first response ends up in the right state
   * either way. Only a request id reused for a different bid is refused.
   */
  describe('bid retries (BID-002)', () => {
    const hoursFromNow = (hours: number) =>
      new Date(Date.now() + hours * 60 * 60 * 1000);

    const liveAuction = async () => {
      const created = await request(app.getHttpServer())
        .post('/auctions/drafts')
        .set('Authorization', authOf(sellerId))
        .send({
          ...draftBody(),
          scheduledStartAt: hoursFromNow(1).toISOString(),
          scheduledEndAt: hoursFromNow(5).toISOString()
        })
        .expect(201);
      const id = (created.body as { id: string }).id;

      // A seller cannot write a start that has already gone by, so the draft
      // is aged into place instead — which is how it reaches its start time.
      await backdateSchedule(prisma, id, {
        startAt: hoursFromNow(-1),
        endAt: hoursFromNow(4)
      });

      await request(app.getHttpServer())
        .post(`/auctions/drafts/${id}/publish`)
        .set('Authorization', authOf(sellerId))
        .expect(200);

      return id;
    };

    const sendBid = (
      auctionId: string,
      userId: string,
      amount: number,
      clientRequestId: string
    ) =>
      request(app.getHttpServer())
        .post(`/auctions/${auctionId}/bids`)
        .set('Authorization', authOf(userId))
        .send({ amount, clientRequestId });

    const storedAuction = (id: string) =>
      prisma.auction.findUniqueOrThrow({
        where: { id },
        select: { currentPrice: true, bidCount: true }
      });

    it('gives a retry the original bid back rather than an error', async () => {
      const auctionId = await liveAuction();
      const clientRequestId = randomUUID();

      const first = await sendBid(
        auctionId,
        buyerId,
        3000,
        clientRequestId
      ).expect(201);
      const retry = await sendBid(
        auctionId,
        buyerId,
        3000,
        clientRequestId
      ).expect(201);

      expect(retry.body).toEqual(first.body);
    });

    it('counts the bid once however many times the retry arrives', async () => {
      const auctionId = await liveAuction();
      const clientRequestId = randomUUID();

      for (let attempt = 0; attempt < 4; attempt += 1) {
        await sendBid(auctionId, buyerId, 3000, clientRequestId).expect(201);
      }

      const stored = await storedAuction(auctionId);
      expect(stored.bidCount).toBe(1);
      expect(stored.currentPrice.toString()).toBe('3000');

      const bids = await prisma.bid.findMany({ where: { auctionId } });
      expect(bids).toHaveLength(1);

      const events = await prisma.auctionEvent.findMany({
        where: { auctionId, eventType: 'BID_PLACED' }
      });
      expect(events).toHaveLength(1);
    });

    it('replays even after somebody else has bid higher', async () => {
      const auctionId = await liveAuction();
      const clientRequestId = randomUUID();

      const first = await sendBid(
        auctionId,
        buyerId,
        3000,
        clientRequestId
      ).expect(201);
      await sendBid(auctionId, strangerId, 3100, randomUUID()).expect(201);

      // the retry is answered from what was recorded, not re-judged against
      // a price that has moved on since
      const retry = await sendBid(
        auctionId,
        buyerId,
        3000,
        clientRequestId
      ).expect(201);
      expect(retry.body).toEqual(first.body);
    });

    it('replays even once the auction has ended', async () => {
      const auctionId = await liveAuction();
      const clientRequestId = randomUUID();

      const first = await sendBid(
        auctionId,
        buyerId,
        5000,
        clientRequestId
      ).expect(201);
      await prisma.auction.update({
        where: { id: auctionId },
        data: { status: 'SOLD', endedAt: new Date() }
      });

      const retry = await sendBid(
        auctionId,
        buyerId,
        5000,
        clientRequestId
      ).expect(201);
      expect(retry.body).toEqual(first.body);
    });

    describe('a request id reused for something else', () => {
      it('is refused when the amount differs', async () => {
        const auctionId = await liveAuction();
        const clientRequestId = randomUUID();

        await sendBid(auctionId, buyerId, 3000, clientRequestId).expect(201);
        await sendBid(auctionId, buyerId, 9000, clientRequestId).expect(409);

        // and the auction is untouched by the attempt
        expect((await storedAuction(auctionId)).currentPrice.toString()).toBe(
          '3000'
        );
      });

      it('is refused when it points at another auction', async () => {
        const first = await liveAuction();
        const second = await liveAuction();
        const clientRequestId = randomUUID();

        await sendBid(first, buyerId, 3000, clientRequestId).expect(201);
        await sendBid(second, buyerId, 3000, clientRequestId).expect(409);

        expect((await storedAuction(second)).bidCount).toBe(0);
      });
    });

    // the case the unique index exists for: both copies get past the lookup
    it('lets simultaneous copies of one retry through as a single bid', async () => {
      const auctionId = await liveAuction();
      const clientRequestId = randomUUID();

      const results = await Promise.all([
        sendBid(auctionId, buyerId, 3000, clientRequestId),
        sendBid(auctionId, buyerId, 3000, clientRequestId),
        sendBid(auctionId, buyerId, 3000, clientRequestId)
      ]);

      // every caller is told the same thing
      expect(results.map((result) => result.status)).toEqual([201, 201, 201]);
      const ids = results.map((result) => (result.body as { id: string }).id);
      expect(new Set(ids).size).toBe(1);

      // and only one bid exists
      const bids = await prisma.bid.findMany({ where: { auctionId } });
      expect(bids).toHaveLength(1);
      expect((await storedAuction(auctionId)).bidCount).toBe(1);
    });
  });

  /**
   * BID-004 — a bid in the last two minutes extends the auction by two more,
   * five times at most, and every extension is on record.
   */
  describe('anti-sniping (BID-004)', () => {
    const MINUTE = 60 * 1000;
    const minutesFromNow = (count: number) =>
      new Date(Date.now() + count * MINUTE);

    /**
     * A live auction ending `endsInMinutes` from now, with `used` extensions
     * already spent. Published normally, then aged into position — AUC-004
     * refuses to publish something already at its deadline.
     */
    const auctionEndingSoon = async (endsInMinutes: number, used = 0) => {
      const created = await request(app.getHttpServer())
        .post('/auctions/drafts')
        .set('Authorization', authOf(sellerId))
        .send({
          ...draftBody(),
          scheduledStartAt: minutesFromNow(60).toISOString(),
          scheduledEndAt: minutesFromNow(180).toISOString()
        })
        .expect(201);
      const id = (created.body as { id: string }).id;

      // A seller cannot write a start that has already gone by, so the draft
      // is aged into place instead — which is how it reaches its start time.
      await backdateSchedule(prisma, id, {
        startAt: minutesFromNow(-60),
        endAt: minutesFromNow(120)
      });

      await request(app.getHttpServer())
        .post(`/auctions/drafts/${id}/publish`)
        .set('Authorization', authOf(sellerId))
        .expect(200);

      await prisma.auction.update({
        where: { id },
        data: {
          currentEndAt: minutesFromNow(endsInMinutes),
          extensionCount: used
        }
      });

      return id;
    };

    const sendBid = (auctionId: string, userId: string, amount: number) =>
      request(app.getHttpServer())
        .post(`/auctions/${auctionId}/bids`)
        .set('Authorization', authOf(userId))
        .send({ amount, clientRequestId: randomUUID() });

    const storedAuction = (id: string) =>
      prisma.auction.findUniqueOrThrow({
        where: { id },
        select: { currentEndAt: true, extensionCount: true }
      });

    it('extends an auction when a bid lands in the last two minutes', async () => {
      const id = await auctionEndingSoon(1);
      const before = await storedAuction(id);

      await sendBid(id, buyerId, 3000).expect(201);

      const after = await storedAuction(id);
      expect(after.extensionCount).toBe(1);
      expect(after.currentEndAt!.getTime()).toBe(
        before.currentEndAt!.getTime() + 2 * MINUTE
      );
    });

    it('leaves an auction alone when there is plenty of time left', async () => {
      const id = await auctionEndingSoon(30);
      const before = await storedAuction(id);

      await sendBid(id, buyerId, 3000).expect(201);

      const after = await storedAuction(id);
      expect(after.extensionCount).toBe(0);
      expect(after.currentEndAt).toEqual(before.currentEndAt);
    });

    it('records every extension with the bid that caused it', async () => {
      const id = await auctionEndingSoon(1);

      const response = await sendBid(id, buyerId, 3000).expect(201);
      const bidId = (response.body as { id: string }).id;

      const extensions = await prisma.auctionExtension.findMany({
        where: { auctionId: id }
      });
      expect(extensions).toHaveLength(1);
      expect(extensions[0]).toMatchObject({
        triggeredByBidId: bidId,
        extensionNumber: 1
      });
      expect(extensions[0].newEndAt.getTime()).toBe(
        extensions[0].previousEndAt.getTime() + 2 * MINUTE
      );
    });

    it('records an EXTENDED event as well as BID_PLACED', async () => {
      const id = await auctionEndingSoon(1);

      await sendBid(id, buyerId, 3000).expect(201);

      const events = await prisma.auctionEvent.findMany({
        where: { auctionId: id },
        orderBy: { id: 'asc' },
        select: { eventType: true }
      });
      expect(events.map((event) => event.eventType)).toEqual([
        'CREATED',
        'PUBLISHED',
        'STARTED',
        'BID_PLACED',
        'EXTENDED'
      ]);
    });

    /**
     * The first bid pushes the end from one minute out to three, which puts it
     * back outside the two-minute window — so a bid arriving immediately after
     * does not extend again. That is the point of measuring from the end time:
     * a burst of bids in one second cannot ratchet the auction forward.
     */
    it('does not extend twice for bids arriving together', async () => {
      const id = await auctionEndingSoon(1);

      await sendBid(id, buyerId, 3000).expect(201);
      await sendBid(id, strangerId, 3100).expect(201);

      expect((await storedAuction(id)).extensionCount).toBe(1);
    });

    it('extends again once the clock has caught up, numbering them in order', async () => {
      const id = await auctionEndingSoon(1);

      await sendBid(id, buyerId, 3000).expect(201);
      // stand in for the two minutes passing: the auction is inside the
      // window again, with its first extension already spent
      await prisma.auction.update({
        where: { id },
        data: { currentEndAt: minutesFromNow(1) }
      });
      await sendBid(id, strangerId, 3100).expect(201);

      const extensions = await prisma.auctionExtension.findMany({
        where: { auctionId: id },
        orderBy: { extensionNumber: 'asc' }
      });
      expect(extensions.map((row) => row.extensionNumber)).toEqual([1, 2]);
      expect((await storedAuction(id)).extensionCount).toBe(2);
    });

    describe('the cap of five', () => {
      it('stops extending once five are spent', async () => {
        const id = await auctionEndingSoon(1, 5);
        const before = await storedAuction(id);

        await sendBid(id, buyerId, 3000).expect(201);

        const after = await storedAuction(id);
        expect(after.extensionCount).toBe(5);
        expect(after.currentEndAt).toEqual(before.currentEndAt);
        expect(
          await prisma.auctionExtension.count({ where: { auctionId: id } })
        ).toBe(0);
      });

      // the cap limits extensions, not bidding
      it('still accepts the bid itself', async () => {
        const id = await auctionEndingSoon(1, 5);

        await sendBid(id, buyerId, 3000).expect(201);

        const stored = await prisma.auction.findUniqueOrThrow({
          where: { id },
          select: { currentPrice: true, bidCount: true }
        });
        expect(stored.currentPrice.toString()).toBe('3000');
        expect(stored.bidCount).toBe(1);
      });
    });

    // BID-002 — the extension rides in the same transaction as the bid
    it('writes no extension for a bid that was refused', async () => {
      const id = await auctionEndingSoon(1);

      await sendBid(id, buyerId, 100).expect(400);

      const after = await storedAuction(id);
      expect(after.extensionCount).toBe(0);
      expect(
        await prisma.auctionExtension.count({ where: { auctionId: id } })
      ).toBe(0);
    });

    it('does not extend twice for a replayed retry', async () => {
      const id = await auctionEndingSoon(1);
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
        .send(body)
        .expect(201);

      expect((await storedAuction(id)).extensionCount).toBe(1);
      expect(
        await prisma.auctionExtension.count({ where: { auctionId: id } })
      ).toBe(1);
    });
  });

  /**
   * BID-005 — the public bid history. Amount and time in full, the bidder only
   * as a masked label, oldest first.
   */
  describe('GET /auctions/:id/bids (BID-005)', () => {
    const hoursFromNow = (hours: number) =>
      new Date(Date.now() + hours * 60 * 60 * 1000);

    const liveAuction = async () => {
      const created = await request(app.getHttpServer())
        .post('/auctions/drafts')
        .set('Authorization', authOf(sellerId))
        .send({
          ...draftBody(),
          scheduledStartAt: hoursFromNow(1).toISOString(),
          scheduledEndAt: hoursFromNow(5).toISOString()
        })
        .expect(201);
      const id = (created.body as { id: string }).id;

      // A seller cannot write a start that has already gone by, so the draft
      // is aged into place instead — which is how it reaches its start time.
      await backdateSchedule(prisma, id, {
        startAt: hoursFromNow(-1),
        endAt: hoursFromNow(4)
      });

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

    type PublicBid = {
      id: string;
      amount: string;
      sequenceNo: number;
      placedAt: string;
      bidder: string;
      isYours: boolean;
    };

    const history = async (auctionId: string, userId?: string, query = '') => {
      const call = request(app.getHttpServer()).get(
        `/auctions/${auctionId}/bids${query}`
      );
      if (userId) call.set('Authorization', authOf(userId));

      const response = await call.expect(200);
      return response.body as {
        items: PublicBid[];
        meta: Record<string, number>;
      };
    };

    it('is readable by a signed-out visitor', async () => {
      const id = await liveAuction();
      await bid(id, buyerId, 3000).expect(201);

      const body = await history(id);

      expect(body.items).toHaveLength(1);
      expect(body.items[0]).toMatchObject({ amount: '3000', sequenceNo: 1 });
    });

    it('lists bids oldest first', async () => {
      const id = await liveAuction();
      await bid(id, buyerId, 3000).expect(201);
      await bid(id, strangerId, 3100).expect(201);
      await bid(id, buyerId, 3200).expect(201);

      const body = await history(id);

      expect(body.items.map((entry) => entry.amount)).toEqual([
        '3000',
        '3100',
        '3200'
      ]);
      expect(body.items.map((entry) => entry.sequenceNo)).toEqual([1, 2, 3]);
    });

    it('reports when each bid was placed', async () => {
      const id = await liveAuction();
      await bid(id, buyerId, 3000).expect(201);

      const body = await history(id);

      expect(Number.isNaN(Date.parse(body.items[0].placedAt))).toBe(false);
    });

    describe('privacy', () => {
      it('masks the bidder name', async () => {
        const id = await liveAuction();
        await bid(id, buyerId, 3000).expect(201);

        const body = await history(id);

        // the buyer's display name is `e2e-auction-buyer-…@example.com`
        expect(body.items[0].bidder).toMatch(/^e\*\*\*.$/);
      });

      it('never sends a bidder id to anyone', async () => {
        const id = await liveAuction();
        await bid(id, buyerId, 3000).expect(201);

        for (const viewer of [undefined, buyerId, sellerId, adminId]) {
          const body = await history(id, viewer);
          expect(body.items[0]).not.toHaveProperty('bidderId');
          expect(JSON.stringify(body.items)).not.toContain(buyerId);
        }
      });

      // not even the seller of the auction gets to see who is bidding
      it('masks the same way for the seller as for a stranger', async () => {
        const id = await liveAuction();
        await bid(id, buyerId, 3000).expect(201);

        const asSeller = await history(id, sellerId);
        const asStranger = await history(id, strangerId);

        expect(asSeller.items[0].bidder).toBe(asStranger.items[0].bidder);
      });

      it('gives the same bidder the same label on every row', async () => {
        // The suite's default display names are email addresses, so they all
        // mask to e***m; real profiles carry a person's name (USR-001).
        await prisma.userProfile.update({
          where: { userId: buyerId },
          data: { displayName: 'Somchai' }
        });
        await prisma.userProfile.update({
          where: { userId: strangerId },
          data: { displayName: 'Pranee' }
        });

        const id = await liveAuction();
        await bid(id, buyerId, 3000).expect(201);
        await bid(id, strangerId, 3100).expect(201);
        await bid(id, buyerId, 3200).expect(201);

        const body = await history(id);

        expect(body.items[0].bidder).toBe('S***i');
        expect(body.items[1].bidder).toBe('P***e');
        // one person's two bids read as the same person
        expect(body.items[0].bidder).toBe(body.items[2].bidder);
      });

      /**
       * The masking is deliberately lossy, and this is the cost: two names that
       * begin and end alike are indistinguishable. It is recorded here rather
       * than left for somebody to discover — the history exists to follow the
       * bidding, not to identify anyone.
       */
      it('cannot tell apart two names that begin and end alike', async () => {
        await prisma.userProfile.update({
          where: { userId: buyerId },
          data: { displayName: 'Somchai' }
        });
        await prisma.userProfile.update({
          where: { userId: strangerId },
          data: { displayName: 'Suchari' }
        });

        const id = await liveAuction();
        await bid(id, buyerId, 3000).expect(201);
        await bid(id, strangerId, 3100).expect(201);

        const body = await history(id);

        expect(body.items[0].bidder).toBe(body.items[1].bidder);
      });
    });

    describe('telling a viewer which bids are theirs', () => {
      it('marks the reader own bids and nobody else', async () => {
        const id = await liveAuction();
        await bid(id, buyerId, 3000).expect(201);
        await bid(id, strangerId, 3100).expect(201);

        const body = await history(id, buyerId);

        expect(body.items.map((entry) => entry.isYours)).toEqual([true, false]);
      });

      it('marks nothing for a signed-out reader', async () => {
        const id = await liveAuction();
        await bid(id, buyerId, 3000).expect(201);

        const body = await history(id);

        expect(body.items.every((entry) => !entry.isYours)).toBe(true);
      });
    });

    describe('which auctions have a history', () => {
      // otherwise the history is a way to read a draft nobody may see
      it('refuses a draft, even to its own seller', async () => {
        const created = await request(app.getHttpServer())
          .post('/auctions/drafts')
          .set('Authorization', authOf(sellerId))
          .send(draftBody())
          .expect(201);
        const draftId = (created.body as { id: string }).id;

        await request(app.getHttpServer())
          .get(`/auctions/${draftId}/bids`)
          .set('Authorization', authOf(sellerId))
          .expect(404);
      });

      it('answers 404 for an auction that does not exist', () => {
        return request(app.getHttpServer())
          .get('/auctions/00000000-0000-4000-8000-0000000099ff/bids')
          .expect(404);
      });

      it('answers 400 for an id that is not a uuid', () => {
        return request(app.getHttpServer())
          .get('/auctions/not-a-uuid/bids')
          .expect(400);
      });

      it('returns an empty list for an auction nobody has bid on', async () => {
        const id = await liveAuction();

        const body = await history(id);

        expect(body.items).toEqual([]);
        expect(body.meta).toMatchObject({ total: 0, totalPages: 0 });
      });
    });

    describe('paging', () => {
      it('pages without repeating or skipping a bid', async () => {
        const id = await liveAuction();
        await bid(id, buyerId, 3000).expect(201);
        await bid(id, strangerId, 3100).expect(201);
        await bid(id, buyerId, 3200).expect(201);
        await bid(id, strangerId, 3300).expect(201);

        const first = await history(id, undefined, '?page=1&limit=2');
        const second = await history(id, undefined, '?page=2&limit=2');

        expect(first.items.map((entry) => entry.sequenceNo)).toEqual([1, 2]);
        expect(second.items.map((entry) => entry.sequenceNo)).toEqual([3, 4]);
        expect(first.meta.total).toBe(4);
      });

      it('rejects a limit past the cap', async () => {
        const id = await liveAuction();

        await request(app.getHttpServer())
          .get(`/auctions/${id}/bids?limit=500`)
          .expect(400);
      });

      it('rejects a page that is not a positive number', async () => {
        const id = await liveAuction();

        await request(app.getHttpServer())
          .get(`/auctions/${id}/bids?page=0`)
          .expect(400);
      });
    });
  });
});
