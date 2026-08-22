import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { AuctionGateway } from './../src/realtime/auction.gateway';
import { PrismaService } from './../src/prisma/prisma.service';
import { authRegistry } from './helpers/auth';
import { expectNoReserve } from './helpers/reserve';

/**
 * ADM-001 — an admin calls off an auction that should not be running, on the
 * record and with a reason. Wider than AUC-006: a seller stops at SCHEDULED,
 * an admin can reach into one that is already ACTIVE.
 */
describe('Admin auction oversight (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let broadcasts: jest.SpyInstance;

  // Unique per run so repeated local runs never collide on the unique indexes.
  const run = Date.now();

  /**
   * Titles carry the run too, not just the emails and slugs. An auction row
   * that outlives its suite — a timeout skips afterAll — is otherwise
   * indistinguishable from real data.
   */
  const auctionTitle = `Vintage Seiko 5 Automatic ${run}`;
  const sellerEmail = `admin-seller-${run}@example.com`;
  const buyerEmail = `admin-buyer-${run}@example.com`;
  const watcherEmail = `admin-watcher-${run}@example.com`;
  const adminEmail = `admin-admin-${run}@example.com`;

  let sellerId: string;
  let buyerId: string;
  let watcherId: string;
  let adminId: string;
  let categoryId: string;
  let authOf: (userId: string) => string;

  const hoursFromNow = (hours: number) =>
    new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();

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

  const createDraft = async () => {
    const created = await request(app.getHttpServer())
      .post('/auctions/drafts')
      .set('Authorization', authOf(sellerId))
      .send({
        title: auctionTitle,
        description: 'Serviced last year, original bracelet.',
        categoryId,
        condition: 'USED',
        startingPrice: 3000,
        minBidIncrement: 100,
        reservePrice: 4500,
        scheduledStartAt: hoursFromNow(1),
        scheduledEndAt: hoursFromNow(5),
        imageUrls: ['https://placehold.co/600x400?text=Front']
      })
      .expect(201);

    return (created.body as { id: string }).id;
  };

  /** Creates a draft and publishes it, returning its id. */
  const publishAuction = async (startInHours: number) => {
    const created = await request(app.getHttpServer())
      .post('/auctions/drafts')
      .set('Authorization', authOf(sellerId))
      .send({
        title: auctionTitle,
        description: 'Serviced last year, original bracelet.',
        categoryId,
        condition: 'USED',
        startingPrice: 3000,
        minBidIncrement: 100,
        reservePrice: 4500,
        scheduledStartAt: hoursFromNow(startInHours),
        scheduledEndAt: hoursFromNow(startInHours + 4),
        imageUrls: ['https://placehold.co/600x400?text=Front']
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

  const cancel = (auctionId: string, userId: string, reason?: string) =>
    request(app.getHttpServer())
      .patch(`/admin/auctions/${auctionId}/cancel`)
      .set('Authorization', authOf(userId))
      .send(reason === undefined ? {} : { reason });

  const notificationsFor = async (userId: string) =>
    (
      await prisma.notification.findMany({
        where: { userId, type: 'AUCTION_CANCELLED' },
        select: { message: true }
      })
    ).map((row) => row.message);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    app = configureApp(
      moduleFixture.createNestApplication()
    ) as INestApplication<App>;
    prisma = app.get(PrismaService);
    await app.init();

    broadcasts = jest.spyOn(app.get(AuctionGateway), 'emitToAuction');

    sellerId = await createUser(sellerEmail, 'USER');
    buyerId = await createUser(buyerEmail, 'USER');
    watcherId = await createUser(watcherEmail, 'USER');
    adminId = await createUser(adminEmail, 'ADMIN');

    const category = await prisma.category.create({
      data: { name: `E2E Admin ${run}`, slug: `e2e-admin-${run}` },
      select: { id: true }
    });
    categoryId = category.id;

    authOf = await authRegistry(app, [sellerId, buyerId, watcherId, adminId]);
  });

  beforeEach(async () => {
    broadcasts.mockClear();
    await prisma.notification.deleteMany({
      where: { userId: { in: [sellerId, buyerId, watcherId, adminId] } }
    });
  });

  afterAll(async () => {
    const userIds = [sellerId, buyerId, watcherId, adminId];
    await prisma.notification.deleteMany({
      where: { userId: { in: userIds } }
    });
    await prisma.adminAction.deleteMany({
      where: { adminUserId: { in: userIds } }
    });
    await prisma.watchlist.deleteMany({
      where: { auction: { sellerId: { in: userIds } } }
    });
    // extensions point at bids, and bids at auctions — unwind in that order
    await prisma.auctionExtension.deleteMany({
      where: { auction: { sellerId: { in: userIds } } }
    });
    await prisma.bid.deleteMany({ where: { bidderId: { in: userIds } } });
    await prisma.auction.deleteMany({ where: { sellerId: { in: userIds } } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  describe('PATCH /admin/auctions/:id/cancel', () => {
    it('cancels a running auction and stores the reason', async () => {
      const auctionId = await publishAuction(-1);

      const response = await cancel(
        auctionId,
        adminId,
        'Counterfeit listing'
      ).expect(200);

      expect(response.body).toMatchObject({
        id: auctionId,
        status: 'CANCELLED'
      });
      const stored = await prisma.auction.findUniqueOrThrow({
        where: { id: auctionId },
        select: { status: true, cancellationReason: true, endedAt: true }
      });
      expect(stored).toMatchObject({
        status: 'CANCELLED',
        cancellationReason: 'Counterfeit listing'
      });
      expect(stored.endedAt).not.toBeNull();
    });

    // this is what separates ADM-001 from AUC-006
    it('reaches an ACTIVE auction that its seller could not cancel', async () => {
      const auctionId = await publishAuction(-1);

      await request(app.getHttpServer())
        .post(`/auctions/${auctionId}/cancel`)
        .set('Authorization', authOf(sellerId))
        .send({ reason: 'changed my mind' })
        .expect(400);

      await cancel(auctionId, adminId, 'Counterfeit listing').expect(200);
    });

    it('cancels a scheduled auction and an unpublished draft', async () => {
      const scheduled = await publishAuction(1);
      const draft = await createDraft();

      await cancel(scheduled, adminId, 'Reported').expect(200);
      await cancel(draft, adminId, 'Reported').expect(200);
    });

    // a sale has a winner and a price behind it; unwinding that is a refund
    it('refuses an auction that has already finished', async () => {
      const auctionId = await publishAuction(-1);
      await bid(auctionId, buyerId, 5000).expect(201);
      await prisma.auction.update({
        where: { id: auctionId },
        data: { currentEndAt: new Date(Date.now() - 1000) }
      });
      await request(app.getHttpServer())
        .get(`/auctions/${auctionId}`)
        .expect(200);

      await cancel(auctionId, adminId, 'Too late').expect(400);
    });

    it('refuses to cancel the same auction twice', async () => {
      const auctionId = await publishAuction(1);
      await cancel(auctionId, adminId, 'Reported').expect(200);

      await cancel(auctionId, adminId, 'Reported again').expect(400);
    });

    it('answers 404 for an auction that does not exist', async () => {
      await cancel(randomUUID(), adminId, 'Reported').expect(404);
    });
  });

  describe('who may call it', () => {
    it('refuses an ordinary user, however good their reason', async () => {
      const auctionId = await publishAuction(1);

      await cancel(auctionId, buyerId, 'I do not like it').expect(403);
    });

    // the seller owns the auction and still cannot use the admin route
    it('refuses the seller of the auction', async () => {
      const auctionId = await publishAuction(1);

      await cancel(auctionId, sellerId, 'Mine to cancel').expect(403);
    });

    it('turns away a visitor who is not signed in', async () => {
      const auctionId = await publishAuction(1);

      await request(app.getHttpServer())
        .patch(`/admin/auctions/${auctionId}/cancel`)
        .send({ reason: 'Reported' })
        .expect(401);
    });
  });

  describe('the reason is required (ADM-001)', () => {
    it.each([
      ['missing', undefined],
      ['empty', ''],
      ['only spaces', '   ']
    ])('refuses a %s reason', async (_case, reason) => {
      const auctionId = await publishAuction(1);

      await cancel(auctionId, adminId, reason).expect(400);

      const stored = await prisma.auction.findUniqueOrThrow({
        where: { id: auctionId },
        select: { status: true }
      });
      expect(stored.status).not.toBe('CANCELLED');
    });
  });

  // ADM-004 — an audit log that can be missing the row for an action that
  // happened is not an audit log
  describe('the audit trail (ADM-004)', () => {
    it('records who cancelled what, and why', async () => {
      const auctionId = await publishAuction(1);

      await cancel(auctionId, adminId, 'Counterfeit listing').expect(200);

      const actions = await prisma.adminAction.findMany({
        where: { auctionId },
        select: { adminUserId: true, actionType: true, note: true }
      });
      expect(actions).toEqual([
        {
          adminUserId: adminId,
          actionType: 'CANCEL_AUCTION',
          note: 'Counterfeit listing'
        }
      ]);
    });

    it('records the CANCELLED event against the admin', async () => {
      const auctionId = await publishAuction(1);

      await cancel(auctionId, adminId, 'Reported').expect(200);

      const events = await prisma.auctionEvent.findMany({
        where: { auctionId, eventType: 'CANCELLED' },
        select: { actorUserId: true }
      });
      expect(events).toEqual([{ actorUserId: adminId }]);
    });

    it('writes no audit row when the cancellation was refused', async () => {
      const auctionId = await publishAuction(1);
      await cancel(auctionId, adminId, 'Reported').expect(200);

      await cancel(auctionId, adminId, 'Again').expect(400);

      expect(await prisma.adminAction.count({ where: { auctionId } })).toBe(1);
    });
  });

  describe('who is told (NOT-004)', () => {
    it('tells the seller, with the reason', async () => {
      const auctionId = await publishAuction(1);

      await cancel(auctionId, adminId, 'Counterfeit listing').expect(200);

      const [message] = await notificationsFor(sellerId);
      expect(message).toContain('Counterfeit listing');
      expect(message).toContain(auctionTitle);
    });

    it('tells the bidders and the watchers', async () => {
      const auctionId = await publishAuction(-1);
      await bid(auctionId, buyerId, 3000).expect(201);
      await request(app.getHttpServer())
        .post(`/auctions/${auctionId}/watchlist`)
        .set('Authorization', authOf(watcherId))
        .expect(200);

      await cancel(auctionId, adminId, 'Counterfeit listing').expect(200);

      expect(await notificationsFor(buyerId)).toHaveLength(1);
      expect(await notificationsFor(watcherId)).toHaveLength(1);
    });

    it('does not tell the admin who did it', async () => {
      const auctionId = await publishAuction(1);
      await request(app.getHttpServer())
        .post(`/auctions/${auctionId}/watchlist`)
        .set('Authorization', authOf(adminId))
        .expect(403);

      await cancel(auctionId, adminId, 'Reported').expect(200);

      expect(await notificationsFor(adminId)).toEqual([]);
    });

    // bidders would otherwise watch a countdown on something that is gone
    it('tells the room, so a screen stops counting down', async () => {
      const auctionId = await publishAuction(-1);

      await cancel(auctionId, adminId, 'Counterfeit listing').expect(200);

      expect(broadcasts).toHaveBeenCalledWith(
        auctionId,
        'auction:cancelled',
        expect.objectContaining({
          auctionId,
          status: 'CANCELLED',
          reason: 'Counterfeit listing'
        })
      );
    });

    // the same event a seller's own cancellation sends (AUC-006)
    it('sends the same event when the seller cancels their own', async () => {
      const auctionId = await publishAuction(1);

      await request(app.getHttpServer())
        .post(`/auctions/${auctionId}/cancel`)
        .set('Authorization', authOf(sellerId))
        .send({ reason: 'Withdrawn' })
        .expect(200);

      expect(broadcasts).toHaveBeenCalledWith(
        auctionId,
        'auction:cancelled',
        expect.objectContaining({ auctionId, status: 'CANCELLED' })
      );
    });
  });

  describe('GET /admin/auctions', () => {
    it('lists auctions of every status, drafts included', async () => {
      const draft = await createDraft();
      const scheduled = await publishAuction(1);

      const response = await request(app.getHttpServer())
        .get('/admin/auctions?limit=100')
        .set('Authorization', authOf(adminId))
        .expect(200);

      const ids = (response.body as { items: { id: string }[] }).items.map(
        (item) => item.id
      );
      expect(ids).toContain(draft);
      expect(ids).toContain(scheduled);
    });

    it('narrows to one status when asked', async () => {
      await createDraft();

      const response = await request(app.getHttpServer())
        .get('/admin/auctions?status=DRAFT&limit=100')
        .set('Authorization', authOf(adminId))
        .expect(200);

      const statuses = (
        response.body as { items: { status: string }[] }
      ).items.map((item) => item.status);
      expect(new Set(statuses)).toEqual(new Set(['DRAFT']));
    });

    it('rejects a status that is not one', async () => {
      await request(app.getHttpServer())
        .get('/admin/auctions?status=NONSENSE')
        .set('Authorization', authOf(adminId))
        .expect(400);
    });

    // SRS 6 forbids disclosing the reserve, and moderating never needs it
    it('never sends the reserve, even to an admin', async () => {
      await createDraft();

      const response = await request(app.getHttpServer())
        .get('/admin/auctions?limit=100')
        .set('Authorization', authOf(adminId))
        .expect(200);

      expectNoReserve(response.body, 4500);
    });

    it('keeps ordinary users out', async () => {
      await request(app.getHttpServer())
        .get('/admin/auctions')
        .set('Authorization', authOf(sellerId))
        .expect(403);
    });
  });
});
