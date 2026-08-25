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

  const createdProductIds: string[] = [];

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

    const body = response.body as { id: string };
    createdProductIds.push(body.id);
    return body.id;
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
    const userIds = [sellerId, strangerId, buyerId];

    await prisma.message.deleteMany({
      where: { conversation: { productId: { in: createdProductIds } } }
    });
    await prisma.conversation.deleteMany({
      where: { productId: { in: createdProductIds } }
    });
    await prisma.notification.deleteMany({
      where: { userId: { in: userIds } }
    });
    await prisma.shipmentEvent.deleteMany({
      where: { shipment: { order: { buyerId: { in: userIds } } } }
    });
    await prisma.shipment.deleteMany({
      where: { order: { buyerId: { in: userIds } } }
    });
    await prisma.orderItem.deleteMany({
      where: { order: { buyerId: { in: userIds } } }
    });
    await prisma.orderAddress.deleteMany({
      where: { order: { buyerId: { in: userIds } } }
    });
    // A payment row is keyed by its checkout session, not by a user, so the
    // orders have to name theirs before they go.
    const orders = await prisma.order.findMany({
      where: { buyerId: { in: userIds } },
      select: { paymentTransactionId: true }
    });
    await prisma.order.deleteMany({ where: { buyerId: { in: userIds } } });
    await prisma.paymentTransaction.deleteMany({
      where: { id: { in: orders.map((order) => order.paymentTransactionId) } }
    });
    await prisma.cartItem.deleteMany({
      where: { cart: { userId: { in: userIds } } }
    });
    await prisma.cart.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.productImage.deleteMany({
      where: { productId: { in: createdProductIds } }
    });
    await prisma.product.deleteMany({ where: { sellerId: { in: userIds } } });
    await prisma.category.delete({ where: { id: categoryId } });
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
        items: { product: { id: string; title: string } }[];
      };
      expect(body.items[0].product.id).toBe(soldId);
      expect(body.items[0].product.title).toBe(`${tag} sold`);
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
