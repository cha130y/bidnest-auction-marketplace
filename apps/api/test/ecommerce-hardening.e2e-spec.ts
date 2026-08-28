import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { authRegistry } from './helpers/auth';
import { PrismaService } from './../src/prisma/prisma.service';

/**
 * The e-commerce rules that only misbehave when somebody pushes at them:
 * a search box fed the characters SQL treats as wildcards, an edit sent by
 * the wrong seller, a delete aimed at a listing an order still points at,
 * and a cancellation that has to put the stock back.
 *
 * Kept apart from ecommerce.e2e-spec.ts, which walks the happy paths.
 */
describe('E-commerce hardening (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const run = Date.now();
  const tag = `HARD${run}`;

  let sellerId: string;
  let strangerId: string;
  let buyerId: string;
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
        email: `hard-${suffix}-${run}@example.com`,
        role: 'USER',
        status: 'ACTIVE',
        profile: { create: { firstName: 'E2E', displayName: `hard-${suffix}` } }
      },
      select: { id: true }
    });
    return user.id;
  };

  const createProduct = async (overrides: Record<string, unknown> = {}) => {
    const response = await request(app.getHttpServer())
      .post('/products')
      .set('Authorization', authOf(sellerId))
      .send({
        title: `${tag} plain`,
        description: 'Created by the hardening suite.',
        categoryId,
        price: 1000,
        stockQty: 5,
        condition: 'NEW',
        imageUrls: ['https://placehold.co/600x400'],
        ...overrides
      })
      .expect(201);

    return (response.body as { id: string }).id;
  };

  const search = async (query: string) => {
    const response = await request(app.getHttpServer())
      .get('/products')
      .query({ q: query, limit: 100 })
      .expect(200);
    const body = response.body as { items: { id: string; title: string }[] };
    return body.items.map((item) => item.title);
  };

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
    strangerId = await createUser('stranger');
    buyerId = await createUser('buyer');

    const category = await prisma.category.create({
      data: { name: `Hardening ${run}`, slug: `hardening-${run}` },
      select: { id: true }
    });
    categoryId = category.id;

    authOf = await authRegistry(app, [sellerId, strangerId, buyerId]);
  });

  afterAll(async () => {
    /**
     * Matched by pattern rather than by the three ids this run made, so a run
     * whose cleanup died half way through is swept by the next one.
     *
     * It has happened: an early version of this block called
     * `paymentTransaction.deleteMany({ where: { userId } })`, which is not a
     * column on that table. The throw took the rest of the cleanup with it and
     * left three users, eight listings and a category behind — and the
     * category turned up in the shop's own filter list, named after a Unix
     * timestamp.
     */
    const leftovers = await prisma.user.findMany({
      where: { email: { startsWith: 'hard-', endsWith: '@example.com' } },
      select: { id: true }
    });
    const userIds = leftovers.map((user) => user.id);

    // Every listing those users ever made, not just the ids this run
    // collected — a crashed run left its own behind and knows nothing of them.
    const stale = await prisma.product.findMany({
      where: { sellerId: { in: userIds } },
      select: { id: true }
    });
    const productIds = stale.map((product) => product.id);

    await prisma.message.deleteMany({
      where: { conversation: { productId: { in: productIds } } }
    });
    await prisma.conversation.deleteMany({
      where: { productId: { in: productIds } }
    });
    await prisma.notification.deleteMany({
      where: { userId: { in: userIds } }
    });
    /**
     * Either side of the order, not just the buyer.
     *
     * `orders.seller_id` is ON DELETE RESTRICT, so an order somebody else
     * placed against one of these fixture sellers pins that user in place —
     * and the throw at `user.deleteMany` took the rest of the sweep with it,
     * which is how a second run made the residue bigger rather than smaller.
     * An order only exists because a fixture did, whoever pressed pay.
     */
    const orderScope = {
      OR: [{ buyerId: { in: userIds } }, { sellerId: { in: userIds } }]
    };

    await prisma.shipmentEvent.deleteMany({
      where: { shipment: { order: orderScope } }
    });
    await prisma.shipment.deleteMany({ where: { order: orderScope } });
    await prisma.orderItem.deleteMany({ where: { order: orderScope } });
    await prisma.orderAddress.deleteMany({ where: { order: orderScope } });
    // A payment row is keyed by its checkout session, not by a user, so the
    // orders have to name theirs before they go.
    const orders = await prisma.order.findMany({
      where: orderScope,
      select: { paymentTransactionId: true }
    });
    await prisma.order.deleteMany({ where: orderScope });
    await prisma.paymentTransaction.deleteMany({
      where: { id: { in: orders.map((order) => order.paymentTransactionId) } }
    });
    await prisma.cartItem.deleteMany({
      where: {
        // A fixture listing can be sitting in a real shopper's cart too.
        OR: [
          { cart: { userId: { in: userIds } } },
          { productId: { in: productIds } }
        ]
      }
    });
    await prisma.cart.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.productWatchlist.deleteMany({
      where: { productId: { in: productIds } }
    });
    await prisma.productImage.deleteMany({
      where: { productId: { in: productIds } }
    });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.category.deleteMany({
      where: { name: { startsWith: 'Hardening ' } }
    });
    await prisma.userProfile.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });

    await app.close();
  });

  /**
   * PROD-003 — `contains` compiles to SQL LIKE, and Prisma passes the pattern
   * through untouched. `%` and `_` are LIKE's own wildcards, so a shopper who
   * types one gets the whole catalogue instead of the listings that carry the
   * character. Both listings below share `tag`, and only one carries the
   * wildcard, which is what tells a literal match from a pattern match.
   */
  describe('PROD-003 — the search box reads what was typed, not a pattern', () => {
    beforeAll(async () => {
      await createProduct({ title: `${tag} plain` });
      await createProduct({ title: `${tag}% off` });
      await createProduct({ title: `${tag}_gap` });
    });

    it('treats % as a character, not "anything"', async () => {
      const titles = await search(`${tag}%`);
      expect(titles).toEqual([`${tag}% off`]);
    });

    it('treats _ as a character, not "any one character"', async () => {
      const titles = await search(`${tag}_`);
      expect(titles).toEqual([`${tag}_gap`]);
    });

    it('still matches the plain text either side of one', async () => {
      const titles = await search(`${tag} plain`);
      expect(titles).toEqual([`${tag} plain`]);
    });
  });

  describe('PROD-002 — a listing answers to its own seller only', () => {
    let productId: string;

    beforeAll(async () => {
      productId = await createProduct({ title: `${tag} owned` });
    });

    it('refuses an edit from a stranger', () =>
      request(app.getHttpServer())
        .patch(`/products/${productId}`)
        .set('Authorization', authOf(strangerId))
        .send({ price: 1 })
        .expect(403));

    it('refuses a pause from a stranger', () =>
      request(app.getHttpServer())
        .patch(`/products/${productId}/status`)
        .set('Authorization', authOf(strangerId))
        .send({ status: 'INACTIVE' })
        .expect(403));

    it('refuses a delete from a stranger', () =>
      request(app.getHttpServer())
        .delete(`/products/${productId}`)
        .set('Authorization', authOf(strangerId))
        .expect(403));

    it('leaves the listing on sale after all that', async () => {
      const response = await request(app.getHttpServer())
        .get(`/products/${productId}`)
        .expect(200);
      expect((response.body as { status: string }).status).toBe('ACTIVE');
    });
  });

  describe('PROD-002 — an edit is checked as strictly as a create', () => {
    let productId: string;

    beforeAll(async () => {
      productId = await createProduct({ title: `${tag} edited` });
    });

    const patch = (payload: Record<string, unknown>) =>
      request(app.getHttpServer())
        .patch(`/products/${productId}`)
        .set('Authorization', authOf(sellerId))
        .send(payload);

    it('refuses a price of zero or less', async () => {
      await patch({ price: 0 }).expect(400);
      await patch({ price: -1 }).expect(400);
    });

    it('refuses negative stock', () => patch({ stockQty: -1 }).expect(400));

    it('refuses a category that does not exist', () =>
      patch({ categoryId: '00000000-0000-4000-8000-000000000000' }).expect(
        400
      ));

    it('refuses a discount of nothing', () =>
      patch({ quantityDiscountMinQty: 2, quantityDiscountPercent: 0 }).expect(
        400
      ));

    // 100 is the ceiling `@Max(100)` allows, and it prices the listing at
    // zero. A seller giving their own stock away is their business, so this
    // records the behaviour rather than calling it wrong.
    it('allows a discount of the whole price', () =>
      patch({ quantityDiscountMinQty: 2, quantityDiscountPercent: 100 }).expect(
        200
      ));

    it('kept the price and the stock as they were', async () => {
      const response = await request(app.getHttpServer())
        .get(`/products/${productId}`)
        .expect(200);
      const body = response.body as { price: string; stockQty: number };
      expect(Number(body.price)).toBe(1000);
      expect(body.stockQty).toBe(5);
    });
  });

  /**
   * PROD-002 — the web client branches on the `status` in this answer
   * (`ProductRemoval` in apps/web/src/lib/api/types.ts), so the difference
   * between "gone" and "only deactivated" is a contract, not an internal
   * detail.
   */
  describe('PROD-002 — deleting a listing an order points at', () => {
    let soldId: string;
    let unsoldId: string;

    beforeAll(async () => {
      soldId = await createProduct({ title: `${tag} sold`, stockQty: 3 });
      unsoldId = await createProduct({ title: `${tag} unsold` });

      await request(app.getHttpServer())
        .post('/cart/items')
        .set('Authorization', authOf(buyerId))
        .send({ productId: soldId, quantity: 1 })
        .expect(201);

      await request(app.getHttpServer())
        .post('/orders/checkout')
        .set('Authorization', authOf(buyerId))
        .send({ paymentMethod: 'CARD', shippingAddress: address })
        .expect(201);
    });

    it('deactivates the sold one and says which happened', async () => {
      const response = await request(app.getHttpServer())
        .delete(`/products/${soldId}`)
        .set('Authorization', authOf(sellerId))
        .expect(200);

      const body = response.body as { status: string; message: string };
      expect(body.status).toBe('INACTIVE');
      expect(body.message).toMatch(/deactivated/i);
    });

    it('takes it off the shelf for everyone but its seller', async () => {
      await request(app.getHttpServer()).get(`/products/${soldId}`).expect(404);

      const owner = await request(app.getHttpServer())
        .get(`/products/${soldId}`)
        .set('Authorization', authOf(sellerId))
        .expect(200);
      expect((owner.body as { status: string }).status).toBe('INACTIVE');
    });

    // The whole point of deactivating instead of removing: the buyer's
    // receipt has to keep naming what they bought.
    it('still names the listing on the order the buyer already placed', async () => {
      const orders = await request(app.getHttpServer())
        .get('/orders')
        .set('Authorization', authOf(buyerId))
        .expect(200);

      const list = orders.body as { items: { id: string }[] };
      const detail = await request(app.getHttpServer())
        .get(`/orders/${list.items[0].id}`)
        .set('Authorization', authOf(buyerId))
        .expect(200);

      const body = detail.body as {
        items: { listing: { kind: string; id: string; title: string } }[];
      };
      expect(body.items[0].listing.kind).toBe('PRODUCT');
      expect(body.items[0].listing.id).toBe(soldId);
      expect(body.items[0].listing.title).toBe(`${tag} sold`);
    });

    it('removes the one nothing points at', async () => {
      const response = await request(app.getHttpServer())
        .delete(`/products/${unsoldId}`)
        .set('Authorization', authOf(sellerId))
        .expect(200);
      expect((response.body as { status: string }).status).toBe('REMOVED');
    });

    it('answers 404 for the removed one', () =>
      request(app.getHttpServer()).get(`/products/${unsoldId}`).expect(404));

    it('hides both from the catalogue', async () => {
      const titles = await search(tag);
      expect(titles).not.toContain(`${tag} sold`);
      expect(titles).not.toContain(`${tag} unsold`);
    });
  });

  /**
   * SHIP-003 — the seller's list is paged and narrowed on the server.
   *
   * Both matter together: a filter applied to rows that were already paged
   * would only ever narrow the page on screen, and quietly drop every match
   * sitting on the next one.
   */
  describe('SHIP-003 — narrowing the seller’s orders by where the parcel is', () => {
    let packing: string;
    let dispatched: string;

    beforeAll(async () => {
      const productId = await createProduct({
        title: `${tag} filter`,
        stockQty: 20
      });

      // Two orders from one seller, moved to different points of the sequence.
      for (let made = 0; made < 2; made += 1) {
        await request(app.getHttpServer())
          .post('/cart/items')
          .set('Authorization', authOf(buyerId))
          .send({ productId, quantity: 1 })
          .expect(201);

        await request(app.getHttpServer())
          .post('/orders/checkout')
          .set('Authorization', authOf(buyerId))
          .send({ paymentMethod: 'CARD', shippingAddress: address })
          .expect(201);
      }

      const list = await request(app.getHttpServer())
        .get('/orders/selling')
        .query({ limit: 100 })
        .set('Authorization', authOf(sellerId))
        .expect(200);

      const forThisProduct = (
        list.body as {
          items: { id: string; items: { listing: { id: string } }[] }[];
        }
      ).items.filter((order) => order.items[0]?.listing.id === productId);

      [packing, dispatched] = forThisProduct.map((order) => order.id);

      await request(app.getHttpServer())
        .patch(`/orders/${dispatched}/shipment`)
        .set('Authorization', authOf(sellerId))
        .send({ status: 'SHIPPED' })
        .expect(200);
    });

    const sellingWhere = async (shipmentStatus: string) => {
      const response = await request(app.getHttpServer())
        .get('/orders/selling')
        .query({ shipmentStatus, limit: 100 })
        .set('Authorization', authOf(sellerId))
        .expect(200);
      return (response.body as { items: { id: string }[] }).items.map(
        (order) => order.id
      );
    };

    it('finds the one still being packed', async () => {
      const ids = await sellingWhere('PROCESSING');
      expect(ids).toContain(packing);
      expect(ids).not.toContain(dispatched);
    });

    it('finds the one on its way', async () => {
      const ids = await sellingWhere('SHIPPED');
      expect(ids).toContain(dispatched);
      expect(ids).not.toContain(packing);
    });

    it('takes several states at once, comma separated', async () => {
      const ids = await sellingWhere('SHIPPED,IN_TRANSIT');
      expect(ids).toContain(dispatched);
      expect(ids).not.toContain(packing);
    });

    it('refuses a state that is not one', () =>
      request(app.getHttpServer())
        .get('/orders/selling')
        .query({ shipmentStatus: 'PACKED' })
        .set('Authorization', authOf(sellerId))
        .expect(400));

    it('pages, and says how many pages there are', async () => {
      const response = await request(app.getHttpServer())
        .get('/orders/selling')
        .query({ page: 1, limit: 1 })
        .set('Authorization', authOf(sellerId))
        .expect(200);

      const body = response.body as {
        items: unknown[];
        meta: {
          page: number;
          limit: number;
          total: number;
          totalPages: number;
        };
      };
      expect(body.items).toHaveLength(1);
      expect(body.meta.limit).toBe(1);
      expect(body.meta.totalPages).toBe(body.meta.total);
    });

    it('counts only what the filter kept, not the whole shelf', async () => {
      const all = await request(app.getHttpServer())
        .get('/orders/selling')
        .query({ limit: 1 })
        .set('Authorization', authOf(sellerId))
        .expect(200);

      const packed = await request(app.getHttpServer())
        .get('/orders/selling')
        .query({ limit: 1, shipmentStatus: 'SHIPPED' })
        .set('Authorization', authOf(sellerId))
        .expect(200);

      const totalOf = (response: { body: unknown }) =>
        (response.body as { meta: { total: number } }).meta.total;

      expect(totalOf(packed)).toBeLessThan(totalOf(all));
    });

    it('never reaches another seller’s orders', async () => {
      const response = await request(app.getHttpServer())
        .get('/orders/selling')
        .query({ limit: 100 })
        .set('Authorization', authOf(strangerId))
        .expect(200);
      expect((response.body as { items: unknown[] }).items).toHaveLength(0);
    });
  });

  /**
   * SHIP-001 — cancelling is the one transition that gives something back.
   * A parcel cancelled while it is still being packed has to return its
   * units to the shelf, or the stock silently leaks one order at a time.
   */
  describe('SHIP-001 — cancelling returns the stock to the shelf', () => {
    let productId: string;
    let orderId: string;

    beforeAll(async () => {
      productId = await createProduct({ title: `${tag} cancel`, stockQty: 10 });

      await request(app.getHttpServer())
        .post('/cart/items')
        .set('Authorization', authOf(buyerId))
        .send({ productId, quantity: 4 })
        .expect(201);

      const checkout = await request(app.getHttpServer())
        .post('/orders/checkout')
        .set('Authorization', authOf(buyerId))
        .send({ paymentMethod: 'CARD', shippingAddress: address })
        .expect(201);

      const body = checkout.body as { orders: { id: string }[] };
      orderId = body.orders[0].id;
    });

    it('took the units off the shelf at checkout', async () => {
      const response = await request(app.getHttpServer())
        .get(`/products/${productId}`)
        .expect(200);
      expect((response.body as { stockQty: number }).stockQty).toBe(6);
    });

    it('refuses a cancellation from the buyer', () =>
      request(app.getHttpServer())
        .patch(`/orders/${orderId}/shipment`)
        .set('Authorization', authOf(buyerId))
        .send({ status: 'CANCELLED' })
        .expect(403));

    it('lets the seller cancel while it is still being packed', () =>
      request(app.getHttpServer())
        .patch(`/orders/${orderId}/shipment`)
        .set('Authorization', authOf(sellerId))
        .send({ status: 'CANCELLED' })
        .expect(200));

    it('puts the units back', async () => {
      const response = await request(app.getHttpServer())
        .get(`/products/${productId}`)
        .expect(200);
      expect((response.body as { stockQty: number }).stockQty).toBe(10);
    });

    it('marks the order cancelled', async () => {
      const response = await request(app.getHttpServer())
        .get(`/orders/${orderId}`)
        .set('Authorization', authOf(buyerId))
        .expect(200);
      expect((response.body as { status: string }).status).toBe('CANCELLED');
    });

    it('will not cancel twice', () =>
      request(app.getHttpServer())
        .patch(`/orders/${orderId}/shipment`)
        .set('Authorization', authOf(sellerId))
        .send({ status: 'CANCELLED' })
        .expect(400));

    it('did not give the stock back a second time', async () => {
      const response = await request(app.getHttpServer())
        .get(`/products/${productId}`)
        .expect(200);
      expect((response.body as { stockQty: number }).stockQty).toBe(10);
    });
  });
});
