import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { authRegistry } from './helpers/auth';
import { PrismaService } from './../src/prisma/prisma.service';

/**
 * AI-003 + CART-004 — negotiating a price and then actually paying it.
 *
 * The SRS puts the two in one sentence: an accepted offer "ปลดล็อกราคาที่
 * ต่อรองได้ในช่วงเวลาสั้นๆ (15 นาที) ใช้ได้ครั้งเดียว... โดยผู้ซื้อยังต้อง
 * checkout ตามปกติ (CART-004)". Everything below is that sentence, in order:
 * the negotiation has to be able to end, the agreed price has to be what is
 * charged, and the permission to pay it has to be spent exactly once by
 * exactly the buyer it was issued to.
 *
 * `POST /products/:id/offers` is throttled to five calls a minute for the
 * whole suite, so this makes three and no more.
 */
describe('Negotiated price checkout (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const run = Date.now();

  const LIST_PRICE = 1000;
  const FLOOR = 500;
  const DISCOUNT_MIN_QTY = 2;
  const DISCOUNT_PERCENT = 25;
  const STOCK = 5;
  const QUANTITY = 2;

  /** Halfway between the opening offer and the asking price — the counter. */
  const AGREED_UNIT_PRICE = 800;

  let sellerId: string;
  let buyerId: string;
  let strangerId: string;
  let categoryId: string;
  let productId: string;
  let authOf: (userId: string) => string;

  /** Carried between the tests below — an offer is expensive to make here. */
  let acceptToken: string;
  let strangerToken: string;

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
        email: `offerpay-${suffix}-${run}@example.com`,
        role: 'USER',
        status: 'ACTIVE',
        profile: {
          create: { firstName: 'E2E', displayName: `offerpay-${suffix}` }
        }
      },
      select: { id: true }
    });
    return user.id;
  };

  const offer = (userId: string, body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post(`/products/${productId}/offers`)
      .set('Authorization', authOf(userId))
      .send(body);

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
    buyerId = await createUser('buyer');
    strangerId = await createUser('stranger');

    const category = await prisma.category.create({
      data: { name: `Offer pay ${run}`, slug: `offer-pay-${run}` },
      select: { id: true }
    });
    categoryId = category.id;

    // PROD-006 sets the secret floor that makes the listing negotiable at all,
    // and PROD-007's discount is here to be *ignored* by the agreed price.
    const product = await prisma.product.create({
      data: {
        sellerId,
        categoryId,
        title: `Offer pay ${run}`,
        description: 'Negotiated by the offer-checkout suite.',
        condition: 'NEW',
        status: 'ACTIVE',
        price: LIST_PRICE,
        stockQty: STOCK,
        negotiationFloor: FLOOR,
        quantityDiscountMinQty: DISCOUNT_MIN_QTY,
        quantityDiscountPercent: DISCOUNT_PERCENT,
        images: {
          create: {
            url: 'https://example.test/offer.jpg',
            storageKey: `offer-pay-${run}`,
            isPrimary: true
          }
        }
      },
      select: { id: true }
    });
    productId = product.id;

    authOf = await authRegistry(app, [sellerId, buyerId, strangerId]);
  });

  afterAll(async () => {
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

    const actors = [sellerId, buyerId, strangerId];

    await prisma.message.deleteMany({
      where: { conversation: { sellerId } }
    });
    await prisma.conversation.deleteMany({ where: { sellerId } });
    await prisma.offer.deleteMany({ where: { productId } });
    await prisma.aIRequest.deleteMany({ where: { userId: { in: actors } } });
    await prisma.productImage.deleteMany({ where: { productId } });
    await prisma.product.deleteMany({ where: { sellerId } });
    await prisma.category.delete({ where: { id: categoryId } });
    await prisma.userProfile.deleteMany({ where: { userId: { in: actors } } });
    await prisma.user.deleteMany({ where: { id: { in: actors } } });

    await app.close();
  });

  it('accepts an offer that meets the counter it was just given', async () => {
    const countered = await offer(buyerId, {
      quantity: QUANTITY,
      offerAmount: 600
    }).expect(201);

    const counter = countered.body as {
      decision: string;
      counterAmount: number;
      acceptToken: string | null;
    };

    expect(counter.decision).toBe('COUNTERED');
    expect(Number(counter.counterAmount)).toBe(AGREED_UNIT_PRICE);
    // Nothing is payable yet — a counter is an invitation, not a deal.
    expect(counter.acceptToken).toBeNull();

    // Immediately, with no wait: meeting the server's own counter is an
    // acceptance rather than another probe at the floor, so the five minute
    // cooldown between offers does not apply to it. Were it charged, a buyer
    // ready to agree would have to sit out the cooldown to say so.
    const accepted = await offer(buyerId, {
      quantity: QUANTITY,
      offerAmount: AGREED_UNIT_PRICE
    }).expect(201);

    const deal = accepted.body as {
      decision: string;
      acceptToken: string | null;
      expiresAt: string | null;
    };

    expect(deal.decision).toBe('ACCEPTED');
    expect(deal.acceptToken).toEqual(expect.any(String));
    expect(deal.expiresAt).toEqual(expect.any(String));

    acceptToken = deal.acceptToken as string;
  });

  it('charges the agreed price, not the list price and not the promo', async () => {
    const response = await pay(buyerId, {
      offerAcceptToken: acceptToken
    }).expect(201);

    const body = response.body as {
      total: string;
      paymentStatus: string;
      orders: { id: string; sellerId: string }[];
    };

    expect(body.paymentStatus).toBe('SUCCEEDED');
    expect(body.orders).toHaveLength(1);
    expect(body.orders[0].sellerId).toBe(sellerId);

    // PROD-007 — "กรณีที่ใช้ AI ต่อรองราคา จะไม่ได้ส่วนลดเพิ่มเติมจากการลด
    // ราคาปกติตามโปรโมชั่น (ไม่ทับซ้อนกัน)". Two units qualify for the 25%
    // rule, so the discount is live on this listing and deliberately not
    // applied: 1500.00 would be the promo answer, 2000.00 the undiscounted
    // list one, and neither is what was agreed.
    expect(body.total).toBe('1600.00');

    const items = await prisma.orderItem.findMany({
      where: { orderId: body.orders[0].id },
      select: { quantity: true, unitPrice: true, productId: true }
    });

    expect(items).toHaveLength(1);
    expect(items[0].productId).toBe(productId);
    expect(items[0].quantity).toBe(QUANTITY);
    expect(items[0].unitPrice.toFixed(2)).toBe('800.00');

    // PROD-005 — an agreed price still draws the shelf down like any sale.
    const product = await prisma.product.findUniqueOrThrow({
      where: { id: productId },
      select: { stockQty: true }
    });
    expect(product.stockQty).toBe(STOCK - QUANTITY);
  });

  it('refuses the same token a second time', async () => {
    const response = await pay(buyerId, {
      offerAcceptToken: acceptToken
    }).expect(400);

    expect((response.body as { code: string }).code).toBe('OFFER_UNUSABLE');

    // Nothing was charged and nothing was written: the shelf is where the
    // successful payment left it.
    const product = await prisma.product.findUniqueOrThrow({
      where: { id: productId },
      select: { stockQty: true }
    });
    expect(product.stockQty).toBe(STOCK - QUANTITY);
  });

  it('refuses a token that was issued to somebody else', async () => {
    // At the asking price, so it is accepted outright and this suite spends
    // one offer rather than two on the setup.
    const accepted = await offer(strangerId, {
      quantity: 1,
      offerAmount: LIST_PRICE
    }).expect(201);

    strangerToken = (accepted.body as { acceptToken: string }).acceptToken;

    const response = await pay(buyerId, {
      offerAcceptToken: strangerToken
    }).expect(400);

    expect((response.body as { code: string }).code).toBe('OFFER_UNUSABLE');
  });

  it('refuses a request that names an offer and a cart at once', async () => {
    await pay(buyerId, {
      offerAcceptToken: acceptToken,
      cartItemIds: ['11111111-1111-4111-8111-111111111111']
    }).expect(400);
  });
});
