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
 * NOT-001..004 — the auction side of the bell, end to end. Rows are written by
 * the flows that raise them and read back through the notification routes Dev 3
 * built, so this checks the two halves actually meet.
 */
describe('Auction notifications (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  // Unique per run so repeated local runs never collide on the unique indexes.
  const run = Date.now();
  const sellerEmail = `notif-seller-${run}@example.com`;
  const buyerEmail = `notif-buyer-${run}@example.com`;
  const rivalEmail = `notif-rival-${run}@example.com`;
  const watcherEmail = `notif-watcher-${run}@example.com`;

  let sellerId: string;
  let buyerId: string;
  let rivalId: string;
  let watcherId: string;
  let categoryId: string;
  let authOf: (userId: string) => string;

  const hoursFromNow = (hours: number) =>
    new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();

  const createUser = async (email: string) => {
    const user = await prisma.user.create({
      data: {
        email,
        role: 'USER',
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
        title: 'Vintage Seiko 5 Automatic',
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

  const watch = (auctionId: string, userId: string) =>
    request(app.getHttpServer())
      .post(`/auctions/${auctionId}/watchlist`)
      .set('Authorization', authOf(userId));

  type Bell = {
    items: {
      id: string;
      type: string;
      title: string;
      message: string;
      auctionId: string | null;
      bidId: string | null;
    }[];
    unread: number;
    meta: { total: number };
  };

  /** The bell, read through Dev 3's route rather than the database. */
  const bellFor = async (userId: string) => {
    const response = await request(app.getHttpServer())
      .get('/notifications?limit=100')
      .set('Authorization', authOf(userId))
      .expect(200);

    return response.body as Bell;
  };

  const typesFor = async (userId: string) =>
    (await bellFor(userId)).items.map((item) => item.type);

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
    await app.init();

    sellerId = await createUser(sellerEmail);
    buyerId = await createUser(buyerEmail);
    rivalId = await createUser(rivalEmail);
    watcherId = await createUser(watcherEmail);

    const category = await prisma.category.create({
      data: { name: `E2E Notif ${run}`, slug: `e2e-notif-${run}` },
      select: { id: true }
    });
    categoryId = category.id;

    authOf = await authRegistry(app, [sellerId, buyerId, rivalId, watcherId]);
  });

  // Each test starts with an empty bell, so counts mean what they say.
  beforeEach(async () => {
    await prisma.notification.deleteMany({
      where: { userId: { in: [sellerId, buyerId, rivalId, watcherId] } }
    });
  });

  afterAll(async () => {
    const userIds = [sellerId, buyerId, rivalId, watcherId];
    await prisma.notification.deleteMany({
      where: { userId: { in: userIds } }
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

  describe('being outbid (NOT-001)', () => {
    it('tells the person who lost the lead, and nobody else', async () => {
      const auctionId = await publishAuction(-1);
      await bid(auctionId, buyerId, 3000).expect(201);

      await bid(auctionId, rivalId, 3100).expect(201);

      const bell = await bellFor(buyerId);
      expect(bell.items).toHaveLength(1);
      expect(bell.items[0]).toMatchObject({
        type: 'OUTBID',
        auctionId
      });
      expect(await typesFor(rivalId)).toEqual([]);
      expect(await typesFor(sellerId)).toEqual([]);
    });

    // the bell should be useful without opening it
    it('names the auction and the price that beat them', async () => {
      const auctionId = await publishAuction(-1);
      await bid(auctionId, buyerId, 3000).expect(201);
      await bid(auctionId, rivalId, 3100).expect(201);

      const [notification] = (await bellFor(buyerId)).items;

      expect(notification.message).toContain('Vintage Seiko 5 Automatic');
      expect(notification.message).toContain('THB 3,100.00');
    });

    // so the bell can open the auction at the moment it happened
    it('points at the bid that displaced them', async () => {
      const auctionId = await publishAuction(-1);
      await bid(auctionId, buyerId, 3000).expect(201);
      const displacing = await bid(auctionId, rivalId, 3100).expect(201);

      const [notification] = (await bellFor(buyerId)).items;

      expect(notification.bidId).toBe((displacing.body as { id: string }).id);
    });

    it('tells nobody on the first bid of an auction', async () => {
      const auctionId = await publishAuction(-1);

      await bid(auctionId, buyerId, 3000).expect(201);

      expect((await bellFor(buyerId)).meta.total).toBe(0);
    });

    // somebody raising their own bid has outbid nobody
    it('says nothing when the leader raises their own bid', async () => {
      const auctionId = await publishAuction(-1);
      await bid(auctionId, buyerId, 3000).expect(201);

      await bid(auctionId, buyerId, 3500).expect(201);

      expect((await bellFor(buyerId)).meta.total).toBe(0);
    });

    // a bidder further down was outbid when the bid above them landed
    it('tells only the current leader, not everybody who ever bid', async () => {
      const auctionId = await publishAuction(-1);
      await bid(auctionId, buyerId, 3000).expect(201);
      await bid(auctionId, rivalId, 3100).expect(201);
      await bid(auctionId, watcherId, 3200).expect(201);

      // buyer heard once, when rival passed them — not again
      expect(await typesFor(buyerId)).toEqual(['OUTBID']);
      expect(await typesFor(rivalId)).toEqual(['OUTBID']);
    });
  });

  describe('an auction ending (NOT-002 / NOT-003)', () => {
    it('tells the winner they won, and for how much', async () => {
      const auctionId = await publishAuction(-1);
      await bid(auctionId, buyerId, 5000).expect(201);

      await runOutOfTime(auctionId);

      const [notification] = (await bellFor(buyerId)).items;
      expect(notification).toMatchObject({
        type: 'AUCTION_WON',
        auctionId
      });
      expect(notification.message).toContain('THB 5,000.00');
    });

    // two rows about the same event would read as a mistake
    it('does not also tell the winner the auction ended', async () => {
      const auctionId = await publishAuction(-1);
      await bid(auctionId, buyerId, 5000).expect(201);
      await watch(auctionId, buyerId).expect(200);

      await runOutOfTime(auctionId);

      expect(await typesFor(buyerId)).toEqual(['AUCTION_WON']);
    });

    it('tells the seller, the losing bidder and the watcher', async () => {
      const auctionId = await publishAuction(-1);
      await bid(auctionId, rivalId, 3000).expect(201);
      await bid(auctionId, buyerId, 5000).expect(201);
      await watch(auctionId, watcherId).expect(200);

      await runOutOfTime(auctionId);

      expect(await typesFor(sellerId)).toEqual(['AUCTION_ENDED']);
      expect(await typesFor(watcherId)).toEqual(['AUCTION_ENDED']);
      // the rival heard about being outbid, then about the ending
      expect((await typesFor(rivalId)).sort()).toEqual([
        'AUCTION_ENDED',
        'OUTBID'
      ]);
    });

    it('tells the seller even when nobody bid at all', async () => {
      const auctionId = await publishAuction(-1);

      await runOutOfTime(auctionId);

      const [notification] = (await bellFor(sellerId)).items;
      expect(notification.type).toBe('AUCTION_ENDED');
      expect(notification.message).toContain('without a single bid');
    });

    it('nobody wins an auction whose top bid missed the reserve', async () => {
      const auctionId = await publishAuction(-1);
      // 3000 clears the starting price but not the 4500 reserve
      await bid(auctionId, buyerId, 3000).expect(201);

      await runOutOfTime(auctionId);

      expect(await typesFor(buyerId)).toEqual(['AUCTION_ENDED']);
      expect(await typesFor(sellerId)).toEqual(['AUCTION_ENDED']);
    });

    // AUC-003 — the reserve stays private after the auction ends too
    it('never puts the reserve in anybody’s bell', async () => {
      const auctionId = await publishAuction(-1);
      await bid(auctionId, buyerId, 3000).expect(201);
      await watch(auctionId, watcherId).expect(200);

      await runOutOfTime(auctionId);

      expectNoReserve(await bellFor(buyerId), 4500);
      expectNoReserve(await bellFor(sellerId), 4500);
      expectNoReserve(await bellFor(watcherId), 4500);
    });

    it('announces the ending once, however many readers arrive', async () => {
      const auctionId = await publishAuction(-1);
      await bid(auctionId, buyerId, 5000).expect(201);
      await prisma.auction.update({
        where: { id: auctionId },
        data: { currentEndAt: new Date(Date.now() - 1000) }
      });

      await Promise.all([
        request(app.getHttpServer()).get(`/auctions/${auctionId}`),
        request(app.getHttpServer()).get(`/auctions/${auctionId}`),
        request(app.getHttpServer()).get(`/auctions/${auctionId}`)
      ]);

      expect(await typesFor(sellerId)).toEqual(['AUCTION_ENDED']);
      expect(await typesFor(buyerId)).toEqual(['AUCTION_WON']);
    });
  });

  describe('a cancellation (NOT-004)', () => {
    it('tells everybody who was watching, with the reason', async () => {
      const auctionId = await publishAuction(1);
      await watch(auctionId, watcherId).expect(200);

      await request(app.getHttpServer())
        .post(`/auctions/${auctionId}/cancel`)
        .set('Authorization', authOf(sellerId))
        .send({ reason: 'Item no longer available' })
        .expect(200);

      const [notification] = (await bellFor(watcherId)).items;
      expect(notification).toMatchObject({
        type: 'AUCTION_CANCELLED',
        auctionId
      });
      expect(notification.message).toContain('Item no longer available');
    });

    // they are the one who just cancelled it
    it('does not tell the seller', async () => {
      const auctionId = await publishAuction(1);
      await watch(auctionId, sellerId).expect(200);

      await request(app.getHttpServer())
        .post(`/auctions/${auctionId}/cancel`)
        .set('Authorization', authOf(sellerId))
        .send({ reason: 'Changed my mind' })
        .expect(200);

      expect((await bellFor(sellerId)).meta.total).toBe(0);
    });

    it('reads cleanly when the seller gave no reason', async () => {
      const auctionId = await publishAuction(1);
      await watch(auctionId, watcherId).expect(200);

      await request(app.getHttpServer())
        .post(`/auctions/${auctionId}/cancel`)
        .set('Authorization', authOf(sellerId))
        .send({})
        .expect(200);

      const [notification] = (await bellFor(watcherId)).items;
      expect(notification.message).not.toContain('Reason:');
      expect(notification.message).toContain('cancelled');
    });
  });

  // the rows have to be readable through the routes that serve the bell
  describe('the bell Dev 3 built serves them', () => {
    it('counts an auction notification towards the unread badge', async () => {
      const auctionId = await publishAuction(-1);
      await bid(auctionId, buyerId, 3000).expect(201);
      await bid(auctionId, rivalId, 3100).expect(201);

      const count = await request(app.getHttpServer())
        .get('/notifications/unread-count')
        .set('Authorization', authOf(buyerId))
        .expect(200);

      expect((count.body as { unread: number }).unread).toBe(1);
    });

    it('filters by an auction type', async () => {
      const auctionId = await publishAuction(-1);
      await bid(auctionId, buyerId, 3000).expect(201);
      await bid(auctionId, rivalId, 3100).expect(201);

      const filtered = await request(app.getHttpServer())
        .get('/notifications?types=OUTBID')
        .set('Authorization', authOf(buyerId))
        .expect(200);

      expect((filtered.body as Bell).items).toHaveLength(1);
    });

    it('keeps one person’s auction notifications out of another’s bell', async () => {
      const auctionId = await publishAuction(-1);
      await bid(auctionId, buyerId, 3000).expect(201);
      await bid(auctionId, rivalId, 3100).expect(201);

      expect((await bellFor(watcherId)).meta.total).toBe(0);
    });
  });
});
