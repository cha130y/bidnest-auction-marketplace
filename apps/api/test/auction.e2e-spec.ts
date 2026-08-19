import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { MOCK_USER_HEADER } from './../src/common/guards/mock-auth.guard';
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
        .set(MOCK_USER_HEADER, sellerId)
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
        .set(MOCK_USER_HEADER, sellerId)
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
        .set(MOCK_USER_HEADER, sellerId)
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
        .set(MOCK_USER_HEADER, sellerId)
        .send({ ...draftBody(), categoryId: inactiveCategoryId })
        .expect(400);
    });

    it('rejects a non-positive starting price', () => {
      return request(app.getHttpServer())
        .post('/auctions/drafts')
        .set(MOCK_USER_HEADER, sellerId)
        .send({ ...draftBody(), startingPrice: 0 })
        .expect(400);
    });

    it('rejects a missing title', () => {
      const { title, ...withoutTitle } = draftBody();
      void title;

      return request(app.getHttpServer())
        .post('/auctions/drafts')
        .set(MOCK_USER_HEADER, sellerId)
        .send(withoutTitle)
        .expect(400);
    });

    it('strips unknown fields instead of trusting them', () => {
      return request(app.getHttpServer())
        .post('/auctions/drafts')
        .set(MOCK_USER_HEADER, sellerId)
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
        .set(MOCK_USER_HEADER, adminId)
        .send(draftBody())
        .expect(403);
    });
  });

  describe('draft privacy', () => {
    let draftId: string;

    beforeAll(async () => {
      const response = await request(app.getHttpServer())
        .post('/auctions/drafts')
        .set(MOCK_USER_HEADER, sellerId)
        .send(draftBody())
        .expect(201);
      draftId = (response.body as { id: string }).id;
    });

    it('lets the owner read their own draft', async () => {
      const response = await request(app.getHttpServer())
        .get(`/auctions/drafts/${draftId}`)
        .set(MOCK_USER_HEADER, sellerId)
        .expect(200);

      expect(response.body).toMatchObject({ id: draftId, status: 'DRAFT' });
    });

    it('hides the draft from another logged-in user', () => {
      return request(app.getHttpServer())
        .get(`/auctions/drafts/${draftId}`)
        .set(MOCK_USER_HEADER, strangerId)
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
        .set(MOCK_USER_HEADER, sellerId)
        .expect(200);

      const body = response.body as { items: { id: string; status: string }[] };
      expect(body.items.length).toBeGreaterThan(0);
      expect(body.items.every((item) => item.status === 'DRAFT')).toBe(true);
      expect(body.items.map((item) => item.id)).toContain(draftId);

      const stranger = await request(app.getHttpServer())
        .get('/auctions/drafts')
        .set(MOCK_USER_HEADER, strangerId)
        .expect(200);
      expect((stranger.body as { items: unknown[] }).items).toEqual([]);
    });
  });
});
