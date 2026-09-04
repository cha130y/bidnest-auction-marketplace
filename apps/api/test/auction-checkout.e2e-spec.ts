import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { authRegistry } from './helpers/auth';
import { PrismaService } from './../src/prisma/prisma.service';

/**
 * CART-004 — a winner paying for the lot they won, through the same endpoint
 * the shop checks out with.
 *
 * The interesting part is not that it works; it is everything it must refuse.
 * The amount comes from the auction's own `soldPrice`, so no request can name
 * a price. The right to pay comes from `winnerUserId`, so no request can buy
 * somebody else's win. And `order_items.auction_id` is unique, so no lot can
 * be paid for twice however many tabs are open.
 */
describe('Auction checkout (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const run = Date.now();
  const tag = `AUCPAY${run}`;

  let sellerId: string;
  let winnerId: string;
  let strangerId: string;
  let categoryId: string;
  let authOf: (userId: string) => string;

  const address = {
    recipientName: 'Anan B.',
    line1: '123 Sukhumvit Rd',
    city: 'Bangkok',
    postalCode: '10110',
    phone: '0812345678'
  };

  const createUser = async (suffix: string) => {
    const user = await prisma.user.create({
      data: {
        email: `aucpay-${suffix}-${run}@example.com`,
        role: 'USER',
        status: 'ACTIVE',
        profile: {
          create: { firstName: 'E2E', displayName: `aucpay-${suffix}` }
        }
      },
      select: { id: true }
    });
    return user.id;
  };

  /**
   * A settled auction, written straight to the database.
   *
   * Bidding one to a close through the API would mean waiting out a real
   * clock, and none of what is being tested here is about how it ended — only
   * about what may happen afterwards. `soldPrice` is what settlement records
   * from the winning bid.
   */
  const settledAuction = async (
    overrides: {
      status?: 'SOLD' | 'UNSOLD' | 'ACTIVE';
      winnerUserId?: string | null;
      soldPrice?: number | null;
    } = {}
  ) => {
    const auction = await prisma.auction.create({
      data: {
        sellerId,
        categoryId,
        title: `${tag} lot`,
        description: 'Settled by the auction-checkout suite.',
        condition: 'NEW',
        status: overrides.status ?? 'SOLD',
        startingPrice: 100,
        minBidIncrement: 10,
        currentPrice: overrides.soldPrice ?? 2500,
        endedAt: new Date(),
        winnerUserId:
          overrides.winnerUserId === undefined
            ? winnerId
            : overrides.winnerUserId,
        soldPrice:
          overrides.soldPrice === undefined ? 2500 : overrides.soldPrice
      },
      select: { id: true }
    });

    return auction.id;
  };

  const pay = (userId: string, body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post('/orders/checkout')
      .set('Authorization', authOf(userId))
      .send({ paymentMethod: 'CARD', shippingAddress: address, ...body });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    app = configureApp(
      moduleFixture.createNestApplication()
    ) as INestApplication<App>;
    prisma = app.get(PrismaService);
    await app.listen(0);

    sellerId = await createUser('seller');
    winnerId = await createUser('winner');
    strangerId = await createUser('stranger');

    const category = await prisma.category.create({
      data: { name: `Auction pay ${run}`, slug: `auction-pay-${run}` },
      select: { id: true }
    });
    categoryId = category.id;

    authOf = await authRegistry(app, [sellerId, winnerId, strangerId]);
  });

  afterAll(async () => {
    // Orders first — order_items point at the auctions, and the FK is
    // RESTRICT precisely so a lot cannot be deleted out from under a receipt.
    const orders = await prisma.order.findMany({
      where: { sellerId },
      select: { id: true }
    });
    const orderIds = orders.map((order) => order.id);

    await prisma.notification.deleteMany({
      where: { orderId: { in: orderIds } }
    });
    await prisma.shipmentEvent.deleteMany({
      where: { shipment: { orderId: { in: orderIds } } }
    });
    await prisma.shipment.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.orderAddress.deleteMany({
      where: { orderId: { in: orderIds } }
    });
    await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.paymentTransaction.deleteMany({
      where: { orders: { none: {} }, method: 'CARD', status: 'SUCCEEDED' }
    });

    await prisma.auction.deleteMany({ where: { sellerId } });

    // The two suites here also list products — one to prove a cart survives an
    // auction payment, one to prove the cart path still works. Both hold the
    // category down until they go.
    await prisma.cartItem.deleteMany({ where: { product: { sellerId } } });
    await prisma.product.deleteMany({ where: { sellerId } });
    await prisma.category.delete({ where: { id: categoryId } });
    await prisma.userProfile.deleteMany({
      where: { userId: { in: [sellerId, winnerId, strangerId] } }
    });
    await prisma.user.deleteMany({
      where: { id: { in: [sellerId, winnerId, strangerId] } }
    });

    await app.close();
  });

  describe('the winner paying', () => {
    it('creates one paid order for the lot', async () => {
      const auctionId = await settledAuction();

      const response = await pay(winnerId, { auctionId }).expect(201);
      const body = response.body as {
        total: string;
        paymentStatus: string;
        orders: { id: string; sellerId: string }[];
      };

      expect(body.paymentStatus).toBe('SUCCEEDED');
      expect(body.orders).toHaveLength(1);
      expect(body.orders[0].sellerId).toBe(sellerId);
      // The lot's own soldPrice, not anything the request said.
      expect(body.total).toBe('2500.00');
    });

    it('charges the price on the lot, whatever the request claims', async () => {
      const auctionId = await settledAuction();

      // `forbidNonWhitelisted` refuses an unknown key outright, which is the
      // strongest possible answer to "can the client name a price".
      await pay(winnerId, { auctionId, total: 1, soldPrice: 1 }).expect(400);
    });

    it('shows the lot on the order, marked as an auction', async () => {
      const auctionId = await settledAuction();
      const paid = await pay(winnerId, { auctionId }).expect(201);
      const orderId = (paid.body as { orders: { id: string }[] }).orders[0].id;

      const response = await request(app.getHttpServer())
        .get(`/orders/${orderId}`)
        .set('Authorization', authOf(winnerId))
        .expect(200);

      const body = response.body as {
        items: {
          quantity: number;
          listing: { kind: string; id: string; title: string } | null;
        }[];
      };

      expect(body.items).toHaveLength(1);
      expect(body.items[0].quantity).toBe(1);
      // AUCTION and not PRODUCT: the buyer's screen links the two to different
      // halves of the site, and getting this wrong lands them on a 404.
      expect(body.items[0].listing?.kind).toBe('AUCTION');
      expect(body.items[0].listing?.id).toBe(auctionId);
      expect(body.items[0].listing?.title).toBe(`${tag} lot`);
    });

    it('leaves the cart alone', async () => {
      const auctionId = await settledAuction();

      const product = await prisma.product.create({
        data: {
          sellerId,
          categoryId,
          title: `${tag} unrelated`,
          description: 'Should survive an auction checkout.',
          condition: 'NEW',
          price: 500,
          stockQty: 3,
          status: 'ACTIVE'
        },
        select: { id: true }
      });

      await request(app.getHttpServer())
        .post('/cart/items')
        .set('Authorization', authOf(winnerId))
        .send({ productId: product.id, quantity: 1 })
        .expect(201);

      await pay(winnerId, { auctionId }).expect(201);

      const cart = await request(app.getHttpServer())
        .get('/cart')
        .set('Authorization', authOf(winnerId))
        .expect(200);

      // Paying for a lot must not empty a basket that had nothing to do with
      // it — and the stock behind that basket must not move either.
      expect((cart.body as { items: unknown[] }).items).toHaveLength(1);

      const after = await prisma.product.findUnique({
        where: { id: product.id },
        select: { stockQty: true }
      });
      expect(after?.stockQty).toBe(3);
    });
  });

  describe('what it refuses', () => {
    it('refuses a second payment for the same lot', async () => {
      const auctionId = await settledAuction();

      await pay(winnerId, { auctionId }).expect(201);
      const refusal = await pay(winnerId, { auctionId }).expect(409);

      // No charge was taken here — the check happens before any money moves —
      // so the screen sends the winner to the order they already have rather
      // than offering a retry that would only be refused again.
      expect(refusal.body).toMatchObject({ code: 'AUCTION_ALREADY_PAID' });
      expect(refusal.body).not.toHaveProperty('checkoutSessionId');
    });

    /**
     * Two payments in flight at once, both past the readable check before
     * either commits. `order_items.auction_id` is unique, so the database
     * settles it — and the loser has to come back as a conflict carrying the
     * session id, not as a 500, because by then it has already been charged.
     */
    it('lets only one of two simultaneous payments through', async () => {
      const auctionId = await settledAuction();

      const [first, second] = await Promise.all([
        pay(winnerId, { auctionId }),
        pay(winnerId, { auctionId })
      ]);

      const codes = [first.status, second.status].sort((a, b) => a - b);
      expect(codes).toEqual([201, 409]);

      const loser = first.status === 409 ? first : second;
      expect(loser.body).toMatchObject({ code: 'AUCTION_ALREADY_PAID' });
      expect(
        (loser.body as { checkoutSessionId?: string }).checkoutSessionId
      ).toEqual(expect.any(String));

      // And exactly one order line exists for the lot, whichever won.
      const items = await prisma.orderItem.findMany({ where: { auctionId } });
      expect(items).toHaveLength(1);
    });

    it('refuses somebody who did not win it', async () => {
      const auctionId = await settledAuction();

      await pay(strangerId, { auctionId }).expect(400);
    });

    it('refuses the seller of the lot', async () => {
      const auctionId = await settledAuction();

      await pay(sellerId, { auctionId }).expect(400);
    });

    it('refuses an auction that did not sell', async () => {
      const auctionId = await settledAuction({
        status: 'UNSOLD',
        winnerUserId: null,
        soldPrice: null
      });

      await pay(winnerId, { auctionId }).expect(400);
    });

    it('refuses one that is still running', async () => {
      const auctionId = await settledAuction({ status: 'ACTIVE' });

      await pay(winnerId, { auctionId }).expect(400);
    });

    it('refuses an auction that does not exist', async () => {
      await pay(winnerId, {
        auctionId: '00000000-0000-4000-8000-0000000000ff'
      }).expect(400);
    });

    it('refuses an auctionId that is not a uuid', async () => {
      await pay(winnerId, { auctionId: 'not-a-uuid' }).expect(400);
    });

    it('refuses a request carrying both an auction and cart lines', async () => {
      const auctionId = await settledAuction();

      await pay(winnerId, {
        auctionId,
        cartItemIds: ['00000000-0000-4000-8000-0000000000aa']
      }).expect(400);
    });
  });

  /**
   * CART-004 — the list the reminder is built from.
   *
   * The route exists because paying for a lot had exactly one way in: the
   * button on the auction's own result screen. Close that tab and there was
   * nothing left that led back to it — `/orders` has no row until the payment
   * creates one, and the cart holds products, never lots.
   *
   * Every assertion below finds its own lot in the response rather than
   * counting rows: this suite settles auctions for the same winner throughout,
   * so a length check here would depend on which tests ran before it.
   */
  describe('the lots still owed for', () => {
    type WonBody = {
      items: {
        auction: { id: string; soldPrice: string | null };
        paid: boolean;
      }[];
      meta: { total: number };
    };

    const wonList = (userId: string, query = '') =>
      request(app.getHttpServer())
        .get(`/auctions/won${query}`)
        .set('Authorization', authOf(userId));

    const rowFor = (body: unknown, auctionId: string) =>
      (body as WonBody).items.find((item) => item.auction.id === auctionId);

    it('lists a lot the winner has not paid for', async () => {
      const auctionId = await settledAuction();

      const response = await wonList(winnerId, '?unpaid=true').expect(200);

      expect(rowFor(response.body, auctionId)).toMatchObject({
        paid: false,
        auction: { id: auctionId, soldPrice: '2500' }
      });
    });

    it('drops it once it has been paid for', async () => {
      const auctionId = await settledAuction();
      await pay(winnerId, { auctionId }).expect(201);

      const response = await wonList(winnerId, '?unpaid=true').expect(200);

      expect(rowFor(response.body, auctionId)).toBeUndefined();
    });

    it('still lists it, marked paid, with the filter off', async () => {
      const auctionId = await settledAuction();
      await pay(winnerId, { auctionId }).expect(201);

      const response = await wonList(winnerId).expect(200);

      expect(rowFor(response.body, auctionId)).toMatchObject({ paid: true });
    });

    it('does not list a lot somebody else won', async () => {
      const auctionId = await settledAuction();

      const response = await wonList(strangerId).expect(200);

      expect(rowFor(response.body, auctionId)).toBeUndefined();
    });

    it('does not list a lot that did not sell', async () => {
      // A checkout would refuse this one, so offering it as something to pay
      // for is offering a button that cannot work.
      const auctionId = await settledAuction({
        status: 'UNSOLD',
        soldPrice: null
      });

      const response = await wonList(winnerId).expect(200);

      expect(rowFor(response.body, auctionId)).toBeUndefined();
    });

    // AUC-003 — the winner is the buyer, and the reserve is the seller's own
    it('does not carry the seller’s reserve', async () => {
      const auctionId = await settledAuction();

      const response = await wonList(winnerId, '?unpaid=true').expect(200);

      expect(rowFor(response.body, auctionId)?.auction).not.toHaveProperty(
        'reservePrice'
      );
    });

    it('refuses a request with no token', async () => {
      await request(app.getHttpServer()).get('/auctions/won').expect(401);
    });

    it('refuses a filter value that is not a boolean', async () => {
      // Rather than quietly treating it as "no filter", which would answer a
      // question nobody asked.
      await wonList(winnerId, '?unpaid=maybe').expect(400);
    });
  });

  describe('a cart checkout is unaffected', () => {
    it('still prices and clears the cart', async () => {
      const product = await prisma.product.create({
        data: {
          sellerId,
          categoryId,
          title: `${tag} still works`,
          description: 'Guards the path this change reshaped.',
          condition: 'NEW',
          price: 700,
          stockQty: 2,
          status: 'ACTIVE'
        },
        select: { id: true }
      });

      await request(app.getHttpServer())
        .post('/cart/items')
        .set('Authorization', authOf(strangerId))
        .send({ productId: product.id, quantity: 2 })
        .expect(201);

      const response = await pay(strangerId, {}).expect(201);
      expect((response.body as { total: string }).total).toBe('1400.00');

      const cart = await request(app.getHttpServer())
        .get('/cart')
        .set('Authorization', authOf(strangerId))
        .expect(200);
      expect((cart.body as { items: unknown[] }).items).toHaveLength(0);

      const after = await prisma.product.findUnique({
        where: { id: product.id },
        select: { stockQty: true, status: true }
      });
      expect(after?.stockQty).toBe(0);
      expect(after?.status).toBe('OUT_OF_STOCK');
    });
  });
});
