import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { authRegistry } from './helpers/auth';
import { PrismaService } from './../src/prisma/prisma.service';

/**
 * Covers the invariants of the e-commerce module that are expensive to notice
 * by hand: the secret negotiation floor, overselling under concurrency, the
 * all-or-nothing checkout, the forward-only shipment sequence, and the privacy
 * rules that keep one user's orders and chats away from everybody else.
 */
describe('E-commerce (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  // Unique per run so repeated local runs never collide on unique indexes.
  const run = Date.now();
  const suiteStartedAt = new Date();

  let sellerAId: string;
  let authOf: (userId: string) => string;
  let sellerBId: string;
  let buyerId: string;
  let strangerId: string;
  // PROD-005 gets its own pair. Who wins its checkout race is undecidable, so
  // the winner's extra order and ORDER_PLACED row would leak that coin flip
  // into every later assertion about the actor that raced — the stranger's
  // "sees only their own" count, and the buyer's orders and shipments.
  let racerAId: string;
  let racerBId: string;
  let adminId: string;
  let categoryId: string;

  const createdProductIds: string[] = [];

  /**
   * A real JPEG header rather than any old bytes: the file validators read
   * magic numbers, so a fake would be refused as the wrong type and never
   * reach the question a test is asking.
   */
  const jpeg = Buffer.from(
    'ffd8ffe000104a46494600010100000100010000ffd9',
    'hex'
  );

  const address = {
    recipientName: 'Anan B.',
    line1: '123 Sukhumvit Rd',
    city: 'Bangkok',
    postalCode: '10110',
    phone: '0812345678'
  };

  const createUser = async (suffix: string, role: 'USER' | 'ADMIN') => {
    const user = await prisma.user.create({
      data: {
        email: `ecom-${suffix}-${run}@example.com`,
        role,
        status: 'ACTIVE',
        profile: { create: { firstName: 'E2E', displayName: `e2e-${suffix}` } }
      },
      select: { id: true }
    });
    return user.id;
  };

  /** Creates a listing straight through the API so its rules are exercised. */
  const createProduct = async (
    sellerId: string,
    overrides: Record<string, unknown> = {}
  ) => {
    const response = await request(app.getHttpServer())
      .post('/products')
      .set('Authorization', authOf(sellerId))
      .send({
        title: `E2E Product ${run}`,
        description: 'Created by the e-commerce e2e suite.',
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

  const addToCart = (userId: string, productId: string, quantity: number) =>
    request(app.getHttpServer())
      .post('/cart/items')
      .set('Authorization', authOf(userId))
      .send({ productId, quantity });

  const checkout = (
    userId: string,
    paymentMethod = 'CARD',
    cartItemIds?: string[]
  ) =>
    request(app.getHttpServer())
      .post('/orders/checkout')
      .set('Authorization', authOf(userId))
      .send({
        paymentMethod,
        shippingAddress: address,
        ...(cartItemIds ? { cartItemIds } : {})
      });

  const cartOf = async (userId: string) => {
    const response = await request(app.getHttpServer())
      .get('/cart')
      .set('Authorization', authOf(userId));
    return response.body as {
      items: {
        id: string;
        quantity: number;
        product: { id: string };
        subtotal: string;
        issue: string | null;
      }[];
      summary: { total: string };
    };
  };

  const emptyCart = async (userId: string) => {
    const cart = await request(app.getHttpServer())
      .get('/cart')
      .set('Authorization', authOf(userId));
    const body = cart.body as { items: { id: string }[] };
    for (const item of body.items ?? []) {
      await request(app.getHttpServer())
        .delete(`/cart/items/${item.id}`)
        .set('Authorization', authOf(userId));
    }
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

    sellerAId = await createUser('seller-a', 'USER');
    sellerBId = await createUser('seller-b', 'USER');
    buyerId = await createUser('buyer', 'USER');
    strangerId = await createUser('stranger', 'USER');
    racerAId = await createUser('racer-a', 'USER');
    racerBId = await createUser('racer-b', 'USER');
    adminId = await createUser('admin', 'ADMIN');

    const category = await prisma.category.create({
      data: { name: `E2E Shop ${run}`, slug: `e2e-shop-${run}` },
      select: { id: true }
    });
    categoryId = category.id;

    authOf = await authRegistry(app, [
      sellerAId,
      sellerBId,
      buyerId,
      strangerId,
      racerAId,
      racerBId,
      adminId
    ]);
  });

  afterAll(async () => {
    const userIds = [
      sellerAId,
      sellerBId,
      buyerId,
      strangerId,
      racerAId,
      racerBId,
      adminId
    ];

    // Deleted in FK order so a failed run still leaves the database clean.
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
    await prisma.orderAddress.deleteMany({
      where: { order: { buyerId: { in: userIds } } }
    });
    await prisma.orderItem.deleteMany({
      where: { order: { buyerId: { in: userIds } } }
    });

    // A declined charge and one that lost the stock race both leave a payment
    // row with no order on purpose, so a charge is never lost. Sweep those
    // first — scoped to this run — then the ones their orders still point at.
    await prisma.paymentTransaction.deleteMany({
      where: { createdAt: { gte: suiteStartedAt }, orders: { none: {} } }
    });

    const orders = await prisma.order.findMany({
      where: { buyerId: { in: userIds } },
      select: { paymentTransactionId: true }
    });
    await prisma.order.deleteMany({ where: { buyerId: { in: userIds } } });
    await prisma.paymentTransaction.deleteMany({
      where: { id: { in: orders.map((o) => o.paymentTransactionId) } }
    });
    await prisma.cartItem.deleteMany({
      where: { cart: { userId: { in: userIds } } }
    });
    await prisma.cart.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.adminAction.deleteMany({
      where: { productId: { in: createdProductIds } }
    });
    await prisma.productWatchlist.deleteMany({
      where: { userId: { in: userIds } }
    });
    await prisma.productImage.deleteMany({
      where: { productId: { in: createdProductIds } }
    });
    await prisma.product.deleteMany({
      where: { id: { in: createdProductIds } }
    });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });

    await app.close();
  });

  describe('PROD-006 — the negotiation floor never reaches a buyer', () => {
    let productId: string;

    beforeAll(async () => {
      productId = await createProduct(sellerAId, { negotiationFloor: 800 });
    });

    it('is absent from the public catalogue', async () => {
      const response = await request(app.getHttpServer())
        .get('/products')
        .expect(200);

      expect(JSON.stringify(response.body)).not.toContain('negotiationFloor');
    });

    it('is absent for a guest reading the detail page', async () => {
      const response = await request(app.getHttpServer())
        .get(`/products/${productId}`)
        .expect(200);

      expect(response.body).not.toHaveProperty('negotiationFloor');
    });

    it('is absent for a signed-in buyer who does not own it', async () => {
      const response = await request(app.getHttpServer())
        .get(`/products/${productId}`)
        .set('Authorization', authOf(buyerId))
        .expect(200);

      expect(response.body).not.toHaveProperty('negotiationFloor');
    });

    it('is visible to the seller who set it', async () => {
      const response = await request(app.getHttpServer())
        .get(`/products/${productId}`)
        .set('Authorization', authOf(sellerAId))
        .expect(200);

      expect(response.body).toHaveProperty('negotiationFloor');
    });
  });

  describe('PROD-002 — a listing keeps a picture to show', () => {
    let productId: string;
    let imageId: string;

    beforeAll(async () => {
      productId = await createProduct(sellerAId);

      const response = await request(app.getHttpServer())
        .get(`/products/${productId}`)
        .expect(200);

      const body = response.body as { images: { id: string }[] };
      imageId = body.images[0].id;
    });

    // The id is what lets a seller's screen name a picture to remove, so it is
    // asserted rather than allowed through: dropping it from the mapper would
    // leave the image manager unable to delete.
    it('names each picture so a screen can point at one', () => {
      expect(imageId).toEqual(expect.any(String));
    });

    it('refuses to remove the only picture a listing has', () =>
      request(app.getHttpServer())
        .delete(`/products/${productId}/images/${imageId}`)
        .set('Authorization', authOf(sellerAId))
        .expect(400));

    it('will not let a stranger touch the pictures', () =>
      request(app.getHttpServer())
        .delete(`/products/${productId}/images/${imageId}`)
        .set('Authorization', authOf(strangerId))
        .expect(403));

    // Cloudinary is optional, and the e2e run has no account behind it. The
    // route is expected to say so rather than accept a file it cannot store.
    it('reports upload as unavailable when no store is configured', () =>
      request(app.getHttpServer())
        .post(`/products/${productId}/images`)
        .set('Authorization', authOf(sellerAId))
        .attach('image', jpeg, 'photo.jpg')
        .expect(503));

    it('refuses a file that is not an image', () =>
      request(app.getHttpServer())
        .post(`/products/${productId}/images`)
        .set('Authorization', authOf(sellerAId))
        .attach('image', Buffer.from('#!/bin/sh\nrm -rf /'), 'photo.jpg')
        .expect(400));

    /**
     * `imageUrls` used to be accepted here and replaced the whole set, which
     * left the files the old rows pointed at in the store with nothing
     * referencing them. The field is no longer part of the edit shape, and
     * `forbidNonWhitelisted` is what turns sending it into an answer instead
     * of a silent replacement.
     */
    it('refuses an edit that tries to replace the pictures', async () => {
      await request(app.getHttpServer())
        .patch(`/products/${productId}`)
        .set('Authorization', authOf(sellerAId))
        .send({ imageUrls: ['https://placehold.co/600x400?text=Replaced'] })
        .expect(400);

      const after = await request(app.getHttpServer())
        .get(`/products/${productId}`)
        .expect(200);

      const body = after.body as { images: { id: string }[] };
      expect(body.images).toHaveLength(1);
      expect(body.images[0].id).toBe(imageId);
    });
  });

  describe('PROD-001 — a picture can be filed before the listing exists', () => {
    // A listing is created with its pictures and has no draft to hold them in
    // the meantime, so the file has to be storable before there is a product
    // id to attach it to.
    it('refuses an upload from nobody', () =>
      request(app.getHttpServer())
        .post('/uploads/images')
        .attach('image', jpeg, 'photo.jpg')
        .expect(401));

    it('refuses a file that is not an image', () =>
      request(app.getHttpServer())
        .post('/uploads/images')
        .set('Authorization', authOf(sellerAId))
        .attach('image', Buffer.from('#!/bin/sh\nrm -rf /'), 'photo.jpg')
        .expect(400));

    it('reports upload as unavailable when no store is configured', () =>
      request(app.getHttpServer())
        .post('/uploads/images')
        .set('Authorization', authOf(sellerAId))
        .attach('image', jpeg, 'photo.jpg')
        .expect(503));
  });

  /**
   * Beyond the SRS — the team's addition, shaped after WAT-001/002 but on its
   * own table, so nothing here touches the auction watchlist.
   */
  describe('Following a listing', () => {
    let productId: string;
    let pausedId: string;
    let droppedId: string;

    const follow = (userId: string, id: string) =>
      request(app.getHttpServer())
        .post(`/products/${id}/watchlist`)
        .set('Authorization', authOf(userId));

    const unfollow = (userId: string, id: string) =>
      request(app.getHttpServer())
        .delete(`/products/${id}/watchlist`)
        .set('Authorization', authOf(userId));

    const followed = async (userId: string) => {
      const response = await request(app.getHttpServer())
        .get('/watchlist/products')
        .set('Authorization', authOf(userId))
        .expect(200);

      return response.body as {
        items: { watchedAt: string; product: { id: string } }[];
        meta: { total: number };
      };
    };

    const pause = (id: string) =>
      request(app.getHttpServer())
        .patch(`/products/${id}/status`)
        .set('Authorization', authOf(sellerAId))
        .send({ status: 'INACTIVE' })
        .expect(200);

    beforeAll(async () => {
      productId = await createProduct(sellerAId);
      droppedId = await createProduct(sellerAId);
      pausedId = await createProduct(sellerAId);
      await pause(pausedId);
    });

    it('refuses to follow anything without a token', () =>
      request(app.getHttpServer())
        .post(`/products/${productId}/watchlist`)
        .expect(401));

    // SRS 2 — admins moderate the marketplace, they do not shop in it
    it('refuses an admin', () => follow(adminId, productId).expect(403));

    it('follows a listing', async () => {
      const response = await follow(buyerId, productId).expect(200);

      expect(response.body).toEqual(
        expect.objectContaining({ productId, watching: true })
      );
    });

    it('is idempotent — a second follow keeps the first timestamp', async () => {
      const first = await follow(buyerId, droppedId).expect(200);
      const second = await follow(buyerId, droppedId).expect(200);

      const at = (response: { body: unknown }) =>
        (response.body as { watchedAt: string }).watchedAt;

      expect(at(second)).toBe(at(first));
    });

    it('lists what the caller follows, and nobody else’s', async () => {
      const mine = await followed(buyerId);
      const theirs = await followed(strangerId);

      expect(mine.items.map((entry) => entry.product.id)).toEqual(
        expect.arrayContaining([productId, droppedId])
      );
      expect(theirs.items.map((entry) => entry.product.id)).not.toContain(
        productId
      );
    });

    /**
     * PROD-006 — this is the buyer's list, so it reads a listing exactly as the
     * catalogue does. The secret floor is not in that shape and must not
     * arrive by way of a different route.
     */
    it('never carries the seller’s private floor', async () => {
      const withFloor = await createProduct(sellerAId, {
        negotiationFloor: 500
      });
      await follow(buyerId, withFloor).expect(200);

      const mine = await followed(buyerId);
      const entry = mine.items.find((it) => it.product.id === withFloor);

      expect(entry).toBeDefined();
      expect(entry?.product).not.toHaveProperty('negotiationFloor');
    });

    it('will not follow a listing that is not on sale', () =>
      follow(buyerId, pausedId).expect(404));

    it('will not follow an id that is not a product', () =>
      follow(buyerId, '00000000-0000-4000-8000-000000000000').expect(404));

    /**
     * A listing the seller pauses, or an admin takes down, leaves the list
     * rather than sitting in it as a row that opens onto a 404.
     */
    it('drops a listing that stops being on sale', async () => {
      await pause(droppedId);

      const mine = await followed(buyerId);
      expect(mine.items.map((entry) => entry.product.id)).not.toContain(
        droppedId
      );
    });

    it('unfollows, and says so only the first time', async () => {
      const first = await unfollow(buyerId, productId).expect(200);
      const second = await unfollow(buyerId, productId).expect(200);

      expect(first.body).toEqual(
        expect.objectContaining({ productId, watching: false, removed: true })
      );
      expect(second.body).toEqual(expect.objectContaining({ removed: false }));

      const mine = await followed(buyerId);
      expect(mine.items.map((entry) => entry.product.id)).not.toContain(
        productId
      );
    });
  });

  describe('PROD-002 — a seller can find their own listings', () => {
    let pausedId: string;

    beforeAll(async () => {
      pausedId = await createProduct(sellerBId);
      await request(app.getHttpServer())
        .patch(`/products/${pausedId}/status`)
        .set('Authorization', authOf(sellerBId))
        .send({ status: 'INACTIVE' })
        .expect(200);
    });

    const listFor = (userId: string) =>
      request(app.getHttpServer())
        .get('/products/mine')
        .set('Authorization', authOf(userId))
        .expect(200);

    it('is not a public list', () =>
      request(app.getHttpServer()).get('/products/mine').expect(401));

    // The word "mine" would be read as an id if this route sat below GET :id.
    it('shows a listing the public catalogue hides', async () => {
      const response = await listFor(sellerBId);
      const body = response.body as { items: { id: string; status: string }[] };

      const paused = body.items.find((item) => item.id === pausedId);
      expect(paused).toMatchObject({ status: 'INACTIVE' });

      const publicList = await request(app.getHttpServer())
        .get('/products?limit=100')
        .expect(200);
      const publicIds = (
        publicList.body as { items: { id: string }[] }
      ).items.map((item) => item.id);
      expect(publicIds).not.toContain(pausedId);
    });

    it('shows the caller only their own', async () => {
      const response = await listFor(sellerAId);
      const body = response.body as { items: { seller: { id: string } }[] };

      expect(body.items.length).toBeGreaterThan(0);
      expect(body.items.every((item) => item.seller.id === sellerAId)).toBe(
        true
      );
    });
  });

  /**
   * CART-001/002 — the cart's own rules, which until now were only ever
   * exercised as a way of setting up a checkout. Every assertion here is
   * something a buyer can reach directly from the shop, and nothing below
   * involves paying for anything.
   */
  describe('CART-001/002 — what may go in a cart, and what happens to it', () => {
    let sellerAProduct: string;
    let scarce: string;

    const setStatus = (productId: string, status: string) =>
      request(app.getHttpServer())
        .patch(`/products/${productId}/status`)
        .set('Authorization', authOf(sellerAId))
        .send({ status })
        .expect(200);

    const setStock = (productId: string, stockQty: number) =>
      request(app.getHttpServer())
        .patch(`/products/${productId}/stock`)
        .set('Authorization', authOf(sellerAId))
        .send({ stockQty })
        .expect(200);

    beforeAll(async () => {
      await emptyCart(buyerId);
      sellerAProduct = await createProduct(sellerAId, {
        price: 100,
        stockQty: 20
      });
      scarce = await createProduct(sellerAId, { price: 50, stockQty: 2 });
    });

    it('refuses the seller their own listing', () =>
      addToCart(sellerAId, sellerAProduct, 1).expect(403));

    it('refuses a quantity of zero or less', async () => {
      await addToCart(buyerId, sellerAProduct, 0).expect(400);
      await addToCart(buyerId, sellerAProduct, -3).expect(400);
    });

    it('refuses more than the listing has', () =>
      addToCart(buyerId, scarce, 5).expect(400));

    it('refuses a listing that does not exist', () =>
      addToCart(buyerId, '00000000-0000-4000-8000-000000000999', 1).expect(
        404
      ));

    it('is not a public cart', () =>
      request(app.getHttpServer())
        .post('/cart/items')
        .send({ productId: sellerAProduct, quantity: 1 })
        .expect(401));

    it('adds to the quantity already there rather than replacing it', async () => {
      await emptyCart(buyerId);
      await addToCart(buyerId, sellerAProduct, 2).expect(201);
      await addToCart(buyerId, sellerAProduct, 3).expect(201);

      const cart = await cartOf(buyerId);
      expect(cart.items).toHaveLength(1);
      expect(cart.items[0].quantity).toBe(5);
    });

    it('will not let that addition exceed the stock either', () =>
      // 5 are already in the cart from above, and only 20 exist
      addToCart(buyerId, sellerAProduct, 16).expect(400));

    it('reprices from the listing rather than from what was quoted', async () => {
      await emptyCart(buyerId);
      await addToCart(buyerId, sellerAProduct, 2).expect(201);
      expect((await cartOf(buyerId)).summary.total).toBe('200.00');

      await request(app.getHttpServer())
        .patch(`/products/${sellerAProduct}`)
        .set('Authorization', authOf(sellerAId))
        .send({ price: 130 })
        .expect(200);

      // CART-002 — the line is worth what the listing is worth now, not what
      // it cost when it went in.
      expect((await cartOf(buyerId)).summary.total).toBe('260.00');
    });

    it('flags a line whose listing was paused, and refuses the checkout', async () => {
      await setStatus(sellerAProduct, 'INACTIVE');

      const cart = await cartOf(buyerId);
      expect(cart.items[0].issue).toBe('PRODUCT_UNAVAILABLE');
      await checkout(buyerId).expect(400);

      await setStatus(sellerAProduct, 'ACTIVE');
    });

    it('flags a line the stock no longer covers, and refuses the checkout', async () => {
      // 2 in the cart, 1 left on the shelf
      await setStock(sellerAProduct, 1);

      const cart = await cartOf(buyerId);
      expect(cart.items[0].issue).toBe('INSUFFICIENT_STOCK');
      await checkout(buyerId).expect(400);
    });

    it('leaves the cart untouched when a checkout is refused', async () => {
      const cart = await cartOf(buyerId);
      expect(cart.items).toHaveLength(1);
      expect(cart.items[0].quantity).toBe(2);
    });

    it('clears the flag once the shelf can cover it again', async () => {
      await setStock(sellerAProduct, 20);
      expect((await cartOf(buyerId)).items[0].issue).toBeNull();
      await emptyCart(buyerId);
    });
  });

  describe('CART-003/PROD-007 — checkout splits per seller and prices lines', () => {
    let orderIds: string[];

    beforeAll(async () => {
      await emptyCart(buyerId);
      // 3+ units take 10% off, so the discount path is exercised too.
      const discounted = await createProduct(sellerAId, {
        price: 2500,
        stockQty: 10,
        quantityDiscountMinQty: 3,
        quantityDiscountPercent: 10
      });
      const plain = await createProduct(sellerBId, {
        price: 1800,
        stockQty: 4
      });

      await addToCart(buyerId, discounted, 3).expect(201);
      await addToCart(buyerId, plain, 2).expect(201);
    });

    it('creates one order per seller under a single payment', async () => {
      const response = await checkout(buyerId).expect(201);
      const body = response.body as {
        paymentStatus: string;
        checkoutSessionId: string;
        total: string;
        orders: { id: string }[];
      };

      expect(body.paymentStatus).toBe('SUCCEEDED');
      expect(body.orders).toHaveLength(2);
      // 3 x 2250 (10% off) + 2 x 1800
      expect(body.total).toBe('10350.00');

      orderIds = body.orders.map((order) => order.id);

      const payments = await prisma.paymentTransaction.findMany({
        where: { checkoutSessionId: body.checkoutSessionId }
      });
      expect(payments).toHaveLength(1);
    });

    it('empties the cart once the orders exist', async () => {
      const response = await request(app.getHttpServer())
        .get('/cart')
        .set('Authorization', authOf(buyerId))
        .expect(200);

      expect((response.body as { items: unknown[] }).items).toHaveLength(0);
    });

    it('stores the discounted unit price on the order line', async () => {
      const items = await prisma.orderItem.findMany({
        where: { orderId: { in: orderIds }, quantity: 3 }
      });

      expect(items).toHaveLength(1);
      expect(items[0].unitPrice.toFixed(2)).toBe('2250.00');
    });

    it('hides an order from everyone but its buyer and seller (SHIP-003)', async () => {
      const [orderId] = orderIds;

      await request(app.getHttpServer())
        .get(`/orders/${orderId}`)
        .set('Authorization', authOf(buyerId))
        .expect(200);

      // Not-found rather than forbidden: an outsider learns nothing.
      await request(app.getHttpServer())
        .get(`/orders/${orderId}`)
        .set('Authorization', authOf(strangerId))
        .expect(404);

      await request(app.getHttpServer()).get(`/orders/${orderId}`).expect(401);
    });
  });

  describe('CART-003 — paying for part of the cart', () => {
    let wantedId: string;
    let leftBehindId: string;

    beforeAll(async () => {
      await emptyCart(buyerId);
      const wanted = await createProduct(sellerAId, {
        price: 700,
        stockQty: 5
      });
      const leftBehind = await createProduct(sellerBId, {
        price: 900,
        stockQty: 5
      });

      await addToCart(buyerId, wanted, 2).expect(201);
      await addToCart(buyerId, leftBehind, 1).expect(201);

      const cart = await cartOf(buyerId);
      wantedId = cart.items.find((item) => item.product.id === wanted)!.id;
      leftBehindId = cart.items.find(
        (item) => item.product.id === leftBehind
      )!.id;
    });

    it('charges for the selected lines only', async () => {
      const response = await checkout(buyerId, 'CARD', [wantedId]).expect(201);
      const body = response.body as {
        total: string;
        orders: { id: string }[];
      };

      // 2 x 700, and none of the 900 line that was not selected
      expect(body.total).toBe('1400.00');
      expect(body.orders).toHaveLength(1);
    });

    it('leaves the unselected line in the cart', async () => {
      const cart = await cartOf(buyerId);

      expect(cart.items).toHaveLength(1);
      expect(cart.items[0].id).toBe(leftBehindId);
    });

    it('refuses a line that is no longer in the cart', async () => {
      // `wantedId` was cleared by the checkout above, so this is exactly the
      // stale selection a second tab would send.
      await checkout(buyerId, 'CARD', [leftBehindId, wantedId]).expect(400);

      // and nothing was taken while refusing
      const cart = await cartOf(buyerId);
      expect(cart.items).toHaveLength(1);
    });

    it("refuses another buyer's cart line", async () => {
      await emptyCart(strangerId);
      const theirs = await createProduct(sellerAId, {
        price: 100,
        stockQty: 5
      });
      await addToCart(strangerId, theirs, 1).expect(201);
      const strangerCart = await cartOf(strangerId);

      await checkout(buyerId, 'CARD', [strangerCart.items[0].id]).expect(400);

      // theirs is untouched: refusing must not reach into another cart
      const after = await cartOf(strangerId);
      expect(after.items).toHaveLength(1);
    });

    it('still pays for everything when no selection is sent', async () => {
      const response = await checkout(buyerId).expect(201);

      expect((response.body as { total: string }).total).toBe('900.00');
      expect((await cartOf(buyerId)).items).toHaveLength(0);
    });
  });

  describe('CART-004 — a declined payment leaves nothing behind', () => {
    let productId: string;

    beforeAll(async () => {
      await emptyCart(buyerId);
      // The mock provider declines this exact total and nothing else.
      productId = await createProduct(sellerAId, { price: 666, stockQty: 4 });
      await addToCart(buyerId, productId, 1).expect(201);
    });

    it('rejects the checkout', () => {
      return checkout(buyerId, 'E_WALLET').expect(400);
    });

    it('creates no order and does not touch stock', async () => {
      const orders = await prisma.order.count({
        where: { buyerId, items: { some: { productId } } }
      });
      expect(orders).toBe(0);

      const product = await prisma.product.findUniqueOrThrow({
        where: { id: productId }
      });
      expect(product.stockQty).toBe(4);
    });

    it('keeps the cart intact so the buyer can retry', async () => {
      const response = await request(app.getHttpServer())
        .get('/cart')
        .set('Authorization', authOf(buyerId))
        .expect(200);

      expect((response.body as { items: unknown[] }).items).toHaveLength(1);
    });

    it('still records the failed attempt', async () => {
      const failed = await prisma.paymentTransaction.count({
        where: { status: 'FAILED' }
      });
      expect(failed).toBeGreaterThan(0);
    });
  });

  describe('PROD-005 — concurrent checkouts cannot oversell', () => {
    let productId: string;

    beforeAll(async () => {
      productId = await createProduct(sellerAId, { price: 4500, stockQty: 1 });
      await addToCart(racerAId, productId, 1).expect(201);
      await addToCart(racerBId, productId, 1).expect(201);
    });

    it('lets exactly one buyer win and leaves stock at zero', async () => {
      const [first, second] = await Promise.all([
        checkout(racerAId),
        checkout(racerBId)
      ]);

      // Whoever wins is a race; the invariant is that only one can.
      const codes = [first.status, second.status].sort((a, b) => a - b);
      expect(codes).toEqual([201, 409]);

      const product = await prisma.product.findUniqueOrThrow({
        where: { id: productId }
      });
      expect(product.stockQty).toBe(0);
      expect(product.status).toBe('OUT_OF_STOCK');

      const orders = await prisma.order.count({
        where: { items: { some: { productId } } }
      });
      expect(orders).toBe(1);
    });
  });

  describe('SHIP-001 — the shipment sequence only moves forward', () => {
    let orderId: string;

    beforeAll(async () => {
      await emptyCart(buyerId);
      const productId = await createProduct(sellerAId, {
        price: 300,
        stockQty: 3
      });
      await addToCart(buyerId, productId, 1).expect(201);
      const response = await checkout(buyerId).expect(201);
      orderId = (response.body as { orders: { id: string }[] }).orders[0].id;
    });

    const advance = (status: string, actorId: string) =>
      request(app.getHttpServer())
        .patch(`/orders/${orderId}/shipment`)
        .set('Authorization', authOf(actorId))
        .send({ status });

    it('starts at PROCESSING with no tracking number', async () => {
      const response = await request(app.getHttpServer())
        .get(`/orders/${orderId}/shipment`)
        .set('Authorization', authOf(buyerId))
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'PROCESSING',
        trackingNumber: null,
        isSimulated: true
      });
    });

    it('refuses to skip a step', () =>
      advance('DELIVERED', sellerAId).expect(400));

    it('refuses to let the buyer move the parcel', () =>
      advance('SHIPPED', buyerId).expect(403));

    it('generates a simulated tracking number on dispatch', async () => {
      const response = await advance('SHIPPED', sellerAId).expect(200);
      const body = response.body as { trackingNumber: string; carrier: string };

      expect(body.trackingNumber).toMatch(/^BN\d{6}[A-Z2-9]{6}$/);
      expect(body.carrier).toEqual(expect.any(String));
    });

    it('refuses to move backwards or cancel after dispatch', async () => {
      await advance('PROCESSING', sellerAId).expect(400);
      await advance('CANCELLED', sellerAId).expect(400);
    });

    it('keeps reporting the tracking number on later steps', async () => {
      const response = await advance('IN_TRANSIT', sellerAId).expect(200);
      expect(
        (response.body as { trackingNumber: string }).trackingNumber
      ).toMatch(/^BN/);
    });

    it('treats DELIVERED as final and notifies twice (NOT-006/007)', async () => {
      const response = await advance('DELIVERED', sellerAId).expect(200);
      expect(response.body).toMatchObject({
        status: 'DELIVERED',
        nextStatuses: []
      });

      await advance('IN_TRANSIT', sellerAId).expect(400);

      const delivered = await prisma.notification.count({
        where: { userId: buyerId, orderId, type: 'DELIVERED' }
      });
      expect(delivered).toBe(1);
    });

    it('records every step in an append-only timeline (SHIP-002)', async () => {
      const response = await request(app.getHttpServer())
        .get(`/orders/${orderId}/shipment`)
        .set('Authorization', authOf(buyerId))
        .expect(200);

      const body = response.body as { timeline: { status: string }[] };
      expect(body.timeline.map((event) => event.status)).toEqual([
        'PROCESSING',
        'SHIPPED',
        'IN_TRANSIT',
        'DELIVERED'
      ]);
    });
  });

  describe('ADM-005 — a suspended listing is the admin’s to release', () => {
    let productId: string;

    beforeAll(async () => {
      productId = await createProduct(sellerAId, { price: 500, stockQty: 2 });
    });

    it('refuses moderation without a reason', () =>
      request(app.getHttpServer())
        .patch(`/admin/products/${productId}/deactivate`)
        .set('Authorization', authOf(adminId))
        .send({})
        .expect(400));

    it('refuses moderation by a regular user', () =>
      request(app.getHttpServer())
        .patch(`/admin/products/${productId}/deactivate`)
        .set('Authorization', authOf(buyerId))
        .send({ reason: 'not mine to moderate' })
        .expect(403));

    it('suspends the listing and logs the reason', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/admin/products/${productId}/deactivate`)
        .set('Authorization', authOf(adminId))
        .send({ reason: 'Suspected counterfeit' })
        .expect(200);

      expect((response.body as { status: string }).status).toBe('SUSPENDED');

      const action = await prisma.adminAction.findFirst({
        where: { productId, actionType: 'DEACTIVATE_PRODUCT' }
      });
      expect(action?.note).toBe('Suspected counterfeit');
    });

    it('hides it from buyers and blocks new orders', async () => {
      await request(app.getHttpServer())
        .get(`/products/${productId}`)
        .expect(404);

      await addToCart(buyerId, productId, 1).expect(400);
    });

    it('locks the seller out of every route back to sale', async () => {
      await request(app.getHttpServer())
        .patch(`/products/${productId}`)
        .set('Authorization', authOf(sellerAId))
        .send({ price: 400 })
        .expect(403);

      await request(app.getHttpServer())
        .patch(`/products/${productId}/status`)
        .set('Authorization', authOf(sellerAId))
        .send({ status: 'ACTIVE' })
        .expect(403);

      await request(app.getHttpServer())
        .patch(`/products/${productId}/stock`)
        .set('Authorization', authOf(sellerAId))
        .send({ stockQty: 9 })
        .expect(403);
    });

    it('comes back on sale only through the admin', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/admin/products/${productId}/reactivate`)
        .set('Authorization', authOf(adminId))
        .send({ reason: 'Seller cleared it up' })
        .expect(200);

      expect((response.body as { status: string }).status).toBe('ACTIVE');
    });
  });

  describe('CHAT — a thread belongs to its two participants only', () => {
    let productId: string;
    let conversationId: string;

    beforeAll(async () => {
      productId = await createProduct(sellerAId, { price: 700, stockQty: 2 });
    });

    it('opens one thread per (product, buyer, seller)', async () => {
      const first = await request(app.getHttpServer())
        .post(`/products/${productId}/conversations`)
        .set('Authorization', authOf(buyerId))
        .expect(201);

      const second = await request(app.getHttpServer())
        .post(`/products/${productId}/conversations`)
        .set('Authorization', authOf(buyerId))
        .expect(201);

      conversationId = (first.body as { id: string }).id;
      expect((second.body as { id: string }).id).toBe(conversationId);
    });

    it('refuses to let a seller open a thread on their own listing', () =>
      request(app.getHttpServer())
        .post(`/products/${productId}/conversations`)
        .set('Authorization', authOf(sellerAId))
        .expect(403));

    it('notifies the other side of a new message (NOT-008)', async () => {
      await request(app.getHttpServer())
        .post(`/conversations/${conversationId}/messages`)
        .set('Authorization', authOf(buyerId))
        .send({ body: '  Is this still available?  ' })
        .expect(201);

      const notifications = await prisma.notification.count({
        where: { userId: sellerAId, conversationId, type: 'NEW_MESSAGE' }
      });
      expect(notifications).toBe(1);
    });

    it('trims the message and rejects an empty one', async () => {
      const response = await request(app.getHttpServer())
        .get(`/conversations/${conversationId}/messages`)
        .set('Authorization', authOf(sellerAId))
        .expect(200);

      const body = response.body as { items: { body: string }[] };
      expect(body.items[0].body).toBe('Is this still available?');

      await request(app.getHttpServer())
        .post(`/conversations/${conversationId}/messages`)
        .set('Authorization', authOf(buyerId))
        .send({ body: '   ' })
        .expect(400);
    });

    it('keeps the thread away from outsiders and admins (SRS 6)', async () => {
      await request(app.getHttpServer())
        .get(`/conversations/${conversationId}/messages`)
        .set('Authorization', authOf(strangerId))
        .expect(404);

      await request(app.getHttpServer())
        .post(`/conversations/${conversationId}/messages`)
        .set('Authorization', authOf(strangerId))
        .send({ body: 'let me in' })
        .expect(404);

      // V1 has no chat moderation, so an admin has no way in either.
      await request(app.getHttpServer())
        .get(`/conversations/${conversationId}/messages`)
        .set('Authorization', authOf(adminId))
        .expect(403);
    });
  });

  describe('NOT-005..008 — the bell only ever shows your own', () => {
    let foreignNotificationId: string;

    beforeAll(async () => {
      // A row owned by somebody else, so the ownership checks aim at something
      // real rather than an invented id that would 404 for the wrong reason.
      const foreign = await prisma.notification.create({
        data: {
          userId: strangerId,
          type: 'ORDER_PLACED',
          title: 'Not yours',
          message: 'This one belongs to another account'
        },
        select: { id: true }
      });
      foreignNotificationId = foreign.id;
    });

    const listFor = (userId: string, query = '') =>
      request(app.getHttpServer())
        .get(`/notifications${query}`)
        .set('Authorization', authOf(userId))
        .expect(200);

    it('shows the caller only their own rows', async () => {
      const mine = await listFor(buyerId, '?limit=100');
      const body = mine.body as {
        items: { id: string; type: string }[];
        unread: number;
        meta: { total: number };
      };

      // The earlier checkouts and shipment moves left this buyer a trail.
      expect(body.meta.total).toBeGreaterThan(0);
      expect(body.items.some((item) => item.type === 'ORDER_PLACED')).toBe(
        true
      );
      expect(body.items.map((item) => item.id)).not.toContain(
        foreignNotificationId
      );

      // The stranger only ever got the one row seeded above.
      const theirs = await listFor(strangerId);
      expect((theirs.body as { meta: { total: number } }).meta.total).toBe(1);
    });

    it('narrows by type and by unread state', async () => {
      const filtered = await listFor(buyerId, '?types=ORDER_PLACED&limit=100');
      const types = (filtered.body as { items: { type: string }[] }).items.map(
        (item) => item.type
      );
      expect(types.length).toBeGreaterThan(0);
      expect(new Set(types)).toEqual(new Set(['ORDER_PLACED']));

      const unread = await listFor(buyerId, '?unreadOnly=true&limit=100');
      const rows = (unread.body as { items: { readAt: string | null }[] })
        .items;
      expect(rows.every((row) => row.readAt === null)).toBe(true);

      // A value that is neither true nor false is a mistake, not a "false".
      await request(app.getHttpServer())
        .get('/notifications?unreadOnly=yes')
        .set('Authorization', authOf(buyerId))
        .expect(400);
    });

    it('marks one read and keeps that timestamp on a repeat', async () => {
      const before = await listFor(buyerId, '?unreadOnly=true&limit=1');
      const target = (before.body as { items: { id: string }[] }).items[0];
      const badgeBefore = (before.body as { unread: number }).unread;

      const first = await request(app.getHttpServer())
        .patch(`/notifications/${target.id}/read`)
        .set('Authorization', authOf(buyerId))
        .expect(200);
      const readAt = (first.body as { readAt: string }).readAt;
      expect(readAt).not.toBeNull();

      const count = await request(app.getHttpServer())
        .get('/notifications/unread-count')
        .set('Authorization', authOf(buyerId))
        .expect(200);
      expect((count.body as { unread: number }).unread).toBe(badgeBefore - 1);

      // Tapping it again must not rewrite when the user first saw it.
      const second = await request(app.getHttpServer())
        .patch(`/notifications/${target.id}/read`)
        .set('Authorization', authOf(buyerId))
        .expect(200);
      expect((second.body as { readAt: string }).readAt).toBe(readAt);
    });

    it('will not touch a row belonging to someone else (SRS 6)', () =>
      // Not-found, not forbidden: the caller learns nothing either way.
      request(app.getHttpServer())
        .patch(`/notifications/${foreignNotificationId}/read`)
        .set('Authorization', authOf(buyerId))
        .expect(404));

    it('clears the whole badge at once', async () => {
      const response = await request(app.getHttpServer())
        .patch('/notifications/read-all')
        .set('Authorization', authOf(buyerId))
        .expect(200);
      expect((response.body as { updated: number }).updated).toBeGreaterThan(0);

      const after = await listFor(buyerId);
      expect((after.body as { unread: number }).unread).toBe(0);

      // The stranger's row is untouched — read-all is scoped to the caller.
      const theirs = await listFor(strangerId);
      expect((theirs.body as { unread: number }).unread).toBe(1);
    });
  });

  describe('SRS 2 — an admin account cannot shop', () => {
    it('cannot list a product, fill a cart, or check out', async () => {
      await request(app.getHttpServer())
        .post('/products')
        .set('Authorization', authOf(adminId))
        .send({
          title: 'Admin listing',
          description: 'should never exist',
          categoryId,
          price: 100,
          stockQty: 1,
          condition: 'NEW',
          imageUrls: ['https://placehold.co/600x400']
        })
        .expect(403);

      const productId = await createProduct(sellerAId, { stockQty: 2 });
      await addToCart(adminId, productId, 1).expect(403);

      await checkout(adminId).expect(403);
    });
  });
});
