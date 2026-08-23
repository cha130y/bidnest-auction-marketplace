import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { PrismaService } from './../src/prisma/prisma.service';
import { authRegistry } from './helpers/auth';
import { expectNoReserve } from './helpers/reserve';

/**
 * WAT-001 / WAT-002 — following auctions end to end: adding and removing one
 * at a time, and a list that shows each one's status, countdown, current price
 * and result.
 */
describe('Watchlist (e2e)', () => {
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
  const draftTitle = `Unpublished draft ${run}`;
  const sellerEmail = `watch-seller-${run}@example.com`;
  const buyerEmail = `watch-buyer-${run}@example.com`;
  const strangerEmail = `watch-stranger-${run}@example.com`;
  const adminEmail = `watch-admin-${run}@example.com`;

  let sellerId: string;
  let buyerId: string;
  let strangerId: string;
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

  const createDraft = async () => {
    const created = await request(app.getHttpServer())
      .post('/auctions/drafts')
      .set('Authorization', authOf(sellerId))
      .send({
        title: draftTitle,
        description: 'Nobody may look at this yet.',
        categoryId,
        condition: 'USED',
        startingPrice: 1000,
        minBidIncrement: 50,
        scheduledStartAt: hoursFromNow(2),
        scheduledEndAt: hoursFromNow(6),
        imageUrls: ['https://placehold.co/600x400?text=Draft']
      })
      .expect(201);

    return (created.body as { id: string }).id;
  };

  const bid = (auctionId: string, userId: string, amount: number) =>
    request(app.getHttpServer())
      .post(`/auctions/${auctionId}/bids`)
      .set('Authorization', authOf(userId))
      .send({ amount, clientRequestId: randomUUID() });

  const watch = (auctionId: string, userId: string) =>
    request(app.getHttpServer())
      .post(`/auctions/${auctionId}/watchlist`)
      .set('Authorization', authOf(userId));

  const unwatch = (auctionId: string, userId: string) =>
    request(app.getHttpServer())
      .delete(`/auctions/${auctionId}/watchlist`)
      .set('Authorization', authOf(userId));

  type Watchlist = {
    items: {
      watchedAt: string;
      auction: { id: string; status: string; currentPrice: string };
      countdown: { serverTime: string; endsAt: string | null };
      result: {
        outcome: 'SOLD' | 'UNSOLD';
        soldPrice: string | null;
        finalPrice: string | null;
        winner: { amount: string; bidder: string; isYours: boolean } | null;
      } | null;
    }[];
    meta: { page: number; limit: number; total: number; totalPages: number };
  };

  const listFor = async (userId: string, query = '') => {
    const response = await request(app.getHttpServer())
      .get(`/watchlist${query}`)
      .set('Authorization', authOf(userId))
      .expect(200);

    return response.body as Watchlist;
  };

  /** Runs an auction out of time and lets the next read settle it (AUC-007). */
  const runOutOfTime = async (auctionId: string) => {
    await prisma.auction.update({
      where: { id: auctionId },
      data: { currentEndAt: new Date(Date.now() - 1000) }
    });

    await request(app.getHttpServer())
      .get(`/auctions/${auctionId}`)
      .expect(200);
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
    buyerId = await createUser(buyerEmail, 'USER');
    strangerId = await createUser(strangerEmail, 'USER');
    adminId = await createUser(adminEmail, 'ADMIN');

    const category = await prisma.category.create({
      data: { name: `E2E Watch ${run}`, slug: `e2e-watch-${run}` },
      select: { id: true }
    });
    categoryId = category.id;

    authOf = await authRegistry(app, [sellerId, buyerId, strangerId, adminId]);
  });

  // Each test starts from an empty list, so counts mean what they say.
  beforeEach(async () => {
    await prisma.watchlist.deleteMany({
      where: { userId: { in: [sellerId, buyerId, strangerId] } }
    });
  });

  afterAll(async () => {
    const userIds = [sellerId, buyerId, strangerId, adminId];
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

  describe('POST /auctions/:id/watchlist', () => {
    it('adds one auction and says when it was added', async () => {
      const auctionId = await publishAuction(1);

      const response = await watch(auctionId, buyerId).expect(200);

      expect(response.body).toMatchObject({ auctionId, watching: true });
      expect((response.body as { watchedAt: string }).watchedAt).not.toBeNull();
      expect((await listFor(buyerId)).meta.total).toBe(1);
    });

    // a double tap on a slow connection is not an error
    it('is idempotent — watching twice leaves one row', async () => {
      const auctionId = await publishAuction(1);

      const first = await watch(auctionId, buyerId).expect(200);
      const second = await watch(auctionId, buyerId).expect(200);

      expect((second.body as { watchedAt: string }).watchedAt).toBe(
        (first.body as { watchedAt: string }).watchedAt
      );
      expect((await listFor(buyerId)).meta.total).toBe(1);
    });

    it('lets somebody watch a finished auction, to keep its result in view', async () => {
      const auctionId = await publishAuction(-1);
      await bid(auctionId, buyerId, 5000).expect(201);
      await runOutOfTime(auctionId);

      await watch(auctionId, buyerId).expect(200);

      expect((await listFor(buyerId)).items[0].auction.status).toBe('SOLD');
    });

    it('lets the seller watch their own auction', async () => {
      const auctionId = await publishAuction(1);

      await watch(auctionId, sellerId).expect(200);

      expect((await listFor(sellerId)).meta.total).toBe(1);
    });

    // saying "you cannot watch it" would confirm a private draft exists
    it('gives nothing away about a draft', async () => {
      const draftId = await createDraft();

      await watch(draftId, buyerId).expect(404);
    });

    it('answers 404 for an auction that does not exist', async () => {
      await watch(randomUUID(), buyerId).expect(404);
    });

    // SRS 2 — admins moderate the marketplace, they do not shop in it
    it('keeps admins out', async () => {
      const auctionId = await publishAuction(1);

      await watch(auctionId, adminId).expect(403);
    });

    it('turns away a visitor who is not signed in', async () => {
      const auctionId = await publishAuction(1);

      await request(app.getHttpServer())
        .post(`/auctions/${auctionId}/watchlist`)
        .expect(401);
    });
  });

  describe('DELETE /auctions/:id/watchlist', () => {
    it('removes it from the list', async () => {
      const auctionId = await publishAuction(1);
      await watch(auctionId, buyerId).expect(200);

      const response = await unwatch(auctionId, buyerId).expect(200);

      expect(response.body).toMatchObject({
        auctionId,
        watching: false,
        removed: true
      });
      expect((await listFor(buyerId)).meta.total).toBe(0);
    });

    // the caller wanted it gone, and it is gone
    it('is not an error when it was never watched', async () => {
      const auctionId = await publishAuction(1);

      const response = await unwatch(auctionId, buyerId).expect(200);

      expect(response.body).toMatchObject({ removed: false });
    });

    it('leaves everybody else’s list alone', async () => {
      const auctionId = await publishAuction(1);
      await watch(auctionId, buyerId).expect(200);
      await watch(auctionId, strangerId).expect(200);

      await unwatch(auctionId, buyerId).expect(200);

      expect((await listFor(strangerId)).meta.total).toBe(1);
    });
  });

  describe('GET /watchlist (WAT-002)', () => {
    it('shows the status, the price and the countdown', async () => {
      const auctionId = await publishAuction(-1);
      await bid(auctionId, strangerId, 3000).expect(201);
      await watch(auctionId, buyerId).expect(200);

      const [item] = (await listFor(buyerId)).items;

      expect(item.auction).toMatchObject({
        id: auctionId,
        status: 'ACTIVE',
        currentPrice: '3000'
      });
      expect(item.countdown.endsAt).not.toBeNull();
      expect(Date.parse(item.countdown.serverTime)).toBeGreaterThan(0);
      expect(item.result).toBeNull();
    });

    it('shows how a finished auction ended', async () => {
      const sold = await publishAuction(-1);
      await bid(sold, strangerId, 5000).expect(201);
      await watch(sold, buyerId).expect(200);
      await runOutOfTime(sold);

      const [item] = (await listFor(buyerId)).items;

      expect(item.auction.status).toBe('SOLD');
      expect(item.result).toMatchObject({
        outcome: 'SOLD',
        soldPrice: '5000',
        finalPrice: '5000'
      });
    });

    // the first thing somebody wants from this screen after an auction ends
    it('tells the watcher when they are the one who won it', async () => {
      const auctionId = await publishAuction(-1);
      await bid(auctionId, buyerId, 5000).expect(201);
      await watch(auctionId, buyerId).expect(200);
      await runOutOfTime(auctionId);

      const [item] = (await listFor(buyerId)).items;

      expect(item.result?.winner).toMatchObject({
        amount: '5000',
        isYours: true
      });
    });

    it('tells a watcher who did not bid that somebody else won', async () => {
      const auctionId = await publishAuction(-1);
      await bid(auctionId, strangerId, 5000).expect(201);
      await watch(auctionId, buyerId).expect(200);
      await runOutOfTime(auctionId);

      const [item] = (await listFor(buyerId)).items;

      expect(item.result?.winner).toMatchObject({ isYours: false });
      expect(item.result?.winner).not.toHaveProperty('bidderId');
    });

    it('shows an auction that did not sell as UNSOLD, with no sale price', async () => {
      const unsold = await publishAuction(-1);
      // 3000 is above the starting price but below the 4500 reserve
      await bid(unsold, strangerId, 3000).expect(201);
      await watch(unsold, buyerId).expect(200);
      await runOutOfTime(unsold);

      const [item] = (await listFor(buyerId)).items;

      expect(item.result).toMatchObject({
        outcome: 'UNSOLD',
        soldPrice: null,
        finalPrice: '3000'
      });
    });

    it('is empty for somebody who watches nothing', async () => {
      const list = await listFor(strangerId);

      expect(list.items).toEqual([]);
      expect(list.meta).toMatchObject({ total: 0, totalPages: 0 });
    });

    it('only ever shows the caller’s own list', async () => {
      const mine = await publishAuction(1);
      const theirs = await publishAuction(1);
      await watch(mine, buyerId).expect(200);
      await watch(theirs, strangerId).expect(200);

      const list = await listFor(buyerId);

      expect(list.items.map((item) => item.auction.id)).toEqual([mine]);
    });

    it('puts the most recently watched first', async () => {
      const first = await publishAuction(1);
      const second = await publishAuction(1);
      await watch(first, buyerId).expect(200);
      await watch(second, buyerId).expect(200);

      const list = await listFor(buyerId);

      expect(list.items.map((item) => item.auction.id)).toEqual([
        second,
        first
      ]);
    });

    it('pages', async () => {
      for (let index = 0; index < 3; index += 1) {
        await watch(await publishAuction(1), buyerId).expect(200);
      }

      const page = await listFor(buyerId, '?page=2&limit=2');

      expect(page.items).toHaveLength(1);
      expect(page.meta).toMatchObject({
        page: 2,
        limit: 2,
        total: 3,
        totalPages: 2
      });
    });

    // AUC-003 — a watchlist is a buyer's screen
    it('never sends the reserve of somebody else’s auction', async () => {
      const auctionId = await publishAuction(1);
      await watch(auctionId, buyerId).expect(200);

      expectNoReserve(await listFor(buyerId), 4500);
    });

    it('still shows a seller the reserve of their own auction', async () => {
      const auctionId = await publishAuction(1);
      await watch(auctionId, sellerId).expect(200);

      expect((await listFor(sellerId)).items[0].auction).toMatchObject({
        reservePrice: '4500'
      });
    });

    it('drops an auction that stops being public', async () => {
      const auctionId = await publishAuction(1);
      await watch(auctionId, buyerId).expect(200);

      await request(app.getHttpServer())
        .post(`/auctions/${auctionId}/cancel`)
        .set('Authorization', authOf(sellerId))
        .send({ reason: 'No longer for sale' })
        .expect(200);

      expect((await listFor(buyerId)).meta.total).toBe(0);
    });

    it('turns away a visitor who is not signed in', async () => {
      await request(app.getHttpServer()).get('/watchlist').expect(401);
    });

    // SRS 2 — admins moderate the marketplace, they do not shop in it
    it('keeps admins out', async () => {
      await request(app.getHttpServer())
        .get('/watchlist')
        .set('Authorization', authOf(adminId))
        .expect(403);
    });
  });
});
