/**
 * DEV ONLY — bulk mock data for building the e-commerce screens against.
 * Never point this at anything but a local database.
 *
 * Scope is the e-commerce domain plus the shared users/categories. Auction,
 * auth-session and AI tables belong to other devs and are deliberately left
 * alone; MOCK_SELLER_IDS / MOCK_BUYER_IDS / MOCK_CATEGORY_IDS are exported so
 * they can build on top of these accounts instead of inventing their own.
 *
 * Everything is keyed off fixed ids and a fixed PRNG seed, so re-running
 * replaces the same rows and every developer ends up with identical data.
 * The fixture rows created by seed.ts are never touched.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { JwtService } from '@nestjs/jwt';
import type { JwtSignOptions } from '@nestjs/jwt';
import { PrismaClient } from '../generated/prisma/client';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL })
});

// ---------------------------------------------------------------- ids + rng

/** `00000000-0000-4000-8000-<kind><index>` — kind keeps each table in its own range. */
const mockId = (kind: string, index: number) =>
  `00000000-0000-4000-8000-${kind}${String(index).padStart(10, '0')}`;

const KIND = {
  user: '10',
  category: '11',
  product: '12',
  order: '13',
  payment: '14',
  conversation: '15',
  cart: '16',
  orderItem: '17',
  address: '18',
  shipment: '19',
  message: '1a',
  notification: '1b'
} as const;

/** Deterministic LCG — the same data every run, on every machine. */
let rngState = 20260821;
const rnd = () => {
  rngState = (rngState * 1103515245 + 12345) % 2147483648;
  return rngState / 2147483648;
};
const int = (min: number, max: number) =>
  min + Math.floor(rnd() * (max - min + 1));
const pick = <T>(items: readonly T[]): T => items[int(0, items.length - 1)];
const chance = (percent: number) => rnd() * 100 < percent;

const COUNTS = {
  sellers: 8,
  buyers: 16,
  suspended: 1,
  products: 120,
  carts: 6,
  // ~70% of sessions hold one seller and ~30% hold two or three, so each session
  // averages about 1.45 orders — 28 sessions is what lands near 40 orders.
  checkoutSessions: 28,
  failedPayments: 3,
  conversations: 12
} as const;

// ------------------------------------------------------------------- corpus
// Written by hand rather than generated: the smoke-test fixtures own the words
// "keyboard", "hub", "denim" and "figurine", and a stray match would break
// its exact-count search assertions.

const FIRST_NAMES = [
  'Kittipong',
  'Sudarat',
  'Naruemon',
  'Thanakrit',
  'Pimchanok',
  'Weerapat',
  'Chayanan',
  'Anucha',
  'Siriporn',
  'Pongsakorn',
  'Nattaya',
  'Kanyarat'
] as const;
const SHOP_WORDS = [
  'Bright',
  'Urban',
  'Golden',
  'Silver',
  'Northern',
  'Riverside',
  'Sunrise',
  'Harbor'
] as const;
const SHOP_SUFFIX = [
  'Store',
  'Market',
  'Trading',
  'Goods',
  'Supply',
  'Corner'
] as const;

const CATEGORY_TREE = [
  { name: 'Home & Living', children: ['Kitchenware', 'Furniture'] },
  { name: 'Sports & Outdoor', children: ['Cycling', 'Camping'] },
  { name: 'Books & Stationery', children: ['Notebooks'] },
  { name: 'Beauty & Care', children: ['Skincare', 'Fragrance'] }
] as const;

const PRODUCT_NOUNS = [
  'Ceramic Mug',
  'Cast Iron Pan',
  'Bamboo Cutting Board',
  'Linen Cushion',
  'Floor Lamp',
  'Storage Basket',
  'Stainless Bottle',
  'Cycling Helmet',
  'Camping Lantern',
  'Trekking Pole',
  'Yoga Mat',
  'Sleeping Bag',
  'Leather Notebook',
  'Fountain Pen',
  'Desk Organiser',
  'Watercolour Set',
  'Sunscreen Lotion',
  'Facial Serum',
  'Aroma Diffuser',
  'Hair Dryer',
  'Wall Clock',
  'Picture Frame',
  'Throw Blanket',
  'Espresso Cup',
  'Dumbbell Set',
  'Resistance Band',
  'Travel Backpack',
  'Folding Chair',
  'Reading Lamp',
  'Spice Rack'
] as const;
const PRODUCT_ADJ = [
  'Handmade',
  'Classic',
  'Compact',
  'Premium',
  'Everyday',
  'Lightweight',
  'Rustic',
  'Modern'
] as const;
const PRODUCT_BLURB = [
  'Barely used, kept in a smoke-free home.',
  'Brand new in the original packaging.',
  'Small scuff on the base, works perfectly.',
  'Bought last year, replaced with a larger one.',
  'Sealed, never opened.',
  'Gently used for a single season.'
] as const;

const CITIES = [
  'Bangkok',
  'Chiang Mai',
  'Khon Kaen',
  'Phuket',
  'Nonthaburi',
  'Udon Thani'
] as const;
const STREETS = [
  'Sukhumvit Rd',
  'Rama IV Rd',
  'Nimmanhaemin Rd',
  'Phahonyothin Rd',
  'Charoen Krung Rd'
] as const;

const BUYER_LINES = [
  'Hi, is this still available?',
  'Could you do a slightly better price if I take two?',
  'How long does delivery usually take?',
  'Does it come with the original box?',
  'Great, I have just placed the order.'
] as const;
const SELLER_LINES = [
  'Yes, still in stock and ready to ship.',
  'I can hold it for you until tomorrow.',
  'Usually two to three days within Bangkok.',
  'It does, everything is included.',
  'Thanks! Packing it up today.'
] as const;

const CARRIERS = [
  'BidNest Express',
  'Nest Logistics',
  'Simulated Post'
] as const;
const TRACKING_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// ------------------------------------------------------------------ exports
// Other devs import these instead of creating their own accounts.

export const MOCK_SELLER_IDS = Array.from({ length: COUNTS.sellers }, (_, i) =>
  mockId(KIND.user, i + 1)
);
export const MOCK_BUYER_IDS = Array.from({ length: COUNTS.buyers }, (_, i) =>
  mockId(KIND.user, COUNTS.sellers + i + 1)
);
export const MOCK_SUSPENDED_ID = mockId(
  KIND.user,
  COUNTS.sellers + COUNTS.buyers + 1
);
const ALL_USER_IDS = [...MOCK_SELLER_IDS, ...MOCK_BUYER_IDS, MOCK_SUSPENDED_ID];

const CATEGORY_NAMES = CATEGORY_TREE.flatMap((parent) => [
  parent.name,
  ...parent.children
]);
/** Active categories only — a listing may never point at a disabled one. */
export const MOCK_CATEGORY_IDS = CATEGORY_NAMES.map((_, i) =>
  mockId(KIND.category, i + 1)
);
const INACTIVE_CATEGORY_ID = mockId(KIND.category, CATEGORY_NAMES.length + 1);

const PRODUCT_IDS = Array.from({ length: COUNTS.products }, (_, i) =>
  mockId(KIND.product, i + 1)
);
const CONVERSATION_IDS = Array.from({ length: COUNTS.conversations }, (_, i) =>
  mockId(KIND.conversation, i + 1)
);
// Postgres uuid columns cannot be matched by prefix, so every id we might have
// written is listed explicitly for the wipe to target.
const PAYMENT_IDS = [
  ...Array.from({ length: COUNTS.checkoutSessions }, (_, i) =>
    mockId(KIND.payment, i + 1)
  ),
  ...Array.from({ length: COUNTS.failedPayments }, (_, i) =>
    mockId(KIND.payment, 900 + i)
  )
];

// ------------------------------------------------------------------- wipe

/**
 * Removes every mock row before rebuilding, in foreign-key order. Scoped to the
 * mock id ranges so seed.ts fixtures and anything a teammate created survive.
 */
async function wipe() {
  await prisma.message.deleteMany({
    where: { conversationId: { in: CONVERSATION_IDS } }
  });
  await prisma.notification.deleteMany({
    where: { userId: { in: ALL_USER_IDS } }
  });
  await prisma.conversation.deleteMany({
    where: { buyerId: { in: ALL_USER_IDS } }
  });
  await prisma.shipmentEvent.deleteMany({
    where: { shipment: { order: { buyerId: { in: ALL_USER_IDS } } } }
  });
  await prisma.shipment.deleteMany({
    where: { order: { buyerId: { in: ALL_USER_IDS } } }
  });
  await prisma.orderAddress.deleteMany({
    where: { order: { buyerId: { in: ALL_USER_IDS } } }
  });
  await prisma.orderItem.deleteMany({
    where: { order: { buyerId: { in: ALL_USER_IDS } } }
  });
  await prisma.order.deleteMany({ where: { buyerId: { in: ALL_USER_IDS } } });
  await prisma.paymentTransaction.deleteMany({
    where: { id: { in: PAYMENT_IDS } }
  });
  await prisma.cartItem.deleteMany({
    where: { cart: { userId: { in: ALL_USER_IDS } } }
  });
  await prisma.cart.deleteMany({ where: { userId: { in: ALL_USER_IDS } } });
  await prisma.productImage.deleteMany({
    where: { productId: { in: PRODUCT_IDS } }
  });
  await prisma.adminAction.deleteMany({
    where: { productId: { in: PRODUCT_IDS } }
  });
  await prisma.product.deleteMany({ where: { id: { in: PRODUCT_IDS } } });
  await prisma.category.deleteMany({
    where: { id: { in: [...MOCK_CATEGORY_IDS, INACTIVE_CATEGORY_ID] } }
  });
  await prisma.userProfile.deleteMany({
    where: { userId: { in: ALL_USER_IDS } }
  });
  await prisma.user.deleteMany({ where: { id: { in: ALL_USER_IDS } } });
}

// ------------------------------------------------------------------- users

async function seedUsers() {
  const rows = ALL_USER_IDS.map((id, index) => {
    const isSeller = index < COUNTS.sellers;
    const isSuspended = id === MOCK_SUSPENDED_ID;
    const firstName = FIRST_NAMES[index % FIRST_NAMES.length];

    return {
      id,
      email: `mock-${isSeller ? 'seller' : 'buyer'}-${index + 1}@bidnest.test`,
      role: 'USER' as const,
      status: isSuspended ? ('SUSPENDED' as const) : ('ACTIVE' as const),
      firstName,
      displayName: isSeller
        ? `${pick(SHOP_WORDS)} ${pick(SHOP_SUFFIX)}`
        : `${firstName} ${String.fromCharCode(65 + (index % 26))}.`,
      // Generated as separate parts rather than one string that later has to
      // be taken apart: the profile stores the same six fields checkout does,
      // so a mock address that arrives already split is one that can be
      // prefilled straight into the form and paid with.
      line1: `${int(1, 999)} ${pick(STREETS)}`,
      city: pick(CITIES),
      postalCode: String(int(10000, 90000)),
      phone: `08${int(10000000, 99999999)}`
    };
  });

  await prisma.user.createMany({
    data: rows.map(
      ({ firstName, displayName, line1, city, postalCode, phone, ...user }) => {
        void firstName;
        void displayName;
        void line1;
        void city;
        void postalCode;
        void phone;
        return user;
      }
    )
  });

  await prisma.userProfile.createMany({
    data: rows.map((row) => ({
      userId: row.id,
      firstName: row.firstName,
      displayName: row.displayName,
      recipientName: row.displayName,
      line1: row.line1,
      city: row.city,
      postalCode: row.postalCode,
      phone: row.phone
    }))
  });

  return rows;
}

// -------------------------------------------------------------- categories

async function seedCategories() {
  // Parents first so the children have something to point at.
  const flat: { id: string; name: string; parentId: string | null }[] = [];
  let cursor = 0;
  for (const parent of CATEGORY_TREE) {
    const parentId = MOCK_CATEGORY_IDS[cursor];
    flat.push({ id: parentId, name: parent.name, parentId: null });
    cursor += 1;
    for (const child of parent.children) {
      flat.push({ id: MOCK_CATEGORY_IDS[cursor], name: child, parentId });
      cursor += 1;
    }
  }

  for (const category of flat) {
    await prisma.category.create({
      data: {
        id: category.id,
        parentId: category.parentId,
        name: category.name,
        slug: slugify(category.name),
        isActive: true
      }
    });
  }

  // ADM-003 — a disabled category proves listings can never reference one.
  await prisma.category.create({
    data: {
      id: INACTIVE_CATEGORY_ID,
      name: 'Seasonal (retired)',
      slug: 'seasonal-retired',
      isActive: false
    }
  });
}

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

// ---------------------------------------------------------------- products

type MockProduct = {
  id: string;
  sellerId: string;
  price: number;
  stockQty: number;
  status: 'ACTIVE' | 'INACTIVE' | 'OUT_OF_STOCK' | 'REMOVED' | 'SUSPENDED';
};

async function seedProducts(): Promise<MockProduct[]> {
  const products: MockProduct[] = [];
  const rows: Record<string, unknown>[] = [];
  const images: Record<string, unknown>[] = [];

  for (const [index, id] of PRODUCT_IDS.entries()) {
    const sellerId = MOCK_SELLER_IDS[index % COUNTS.sellers];
    const status = pickProductStatus();
    // PROD-005 — stock and status must agree, or the API would contradict itself.
    const stockQty = status === 'OUT_OF_STOCK' ? 0 : int(1, 40);
    const price = priceForIndex(index);

    // PROD-007 — a discount rule is all-or-nothing.
    const hasDiscount = chance(25);
    // PROD-006 — the floor is private and can never exceed the asking price.
    const hasFloor = chance(30);

    products.push({ id, sellerId, price, stockQty, status });
    rows.push({
      id,
      sellerId,
      categoryId: pick(MOCK_CATEGORY_IDS),
      title: `${pick(PRODUCT_ADJ)} ${pick(PRODUCT_NOUNS)}`,
      description: pick(PRODUCT_BLURB),
      price: price.toFixed(2),
      stockQty,
      condition: chance(45) ? 'NEW' : 'USED',
      status,
      negotiationFloor: hasFloor ? (price * 0.8).toFixed(2) : null,
      quantityDiscountMinQty: hasDiscount ? int(2, 5) : null,
      quantityDiscountPercent: hasDiscount ? int(5, 20).toFixed(2) : null
    });

    for (let position = 0; position < int(1, 3); position += 1) {
      images.push({
        productId: id,
        storageKey: `mock/${id}/${position}`,
        url: `https://placehold.co/600x400?text=Item+${index + 1}-${position + 1}`,
        position,
        isPrimary: position === 0
      });
    }
  }

  await prisma.product.createMany({ data: rows as never });
  await prisma.productImage.createMany({ data: images as never });

  return products;
}

/** Roughly the mix a real catalogue shows, so every UI state has data behind it. */
function pickProductStatus(): MockProduct['status'] {
  const roll = int(1, 100);
  if (roll <= 70) return 'ACTIVE';
  if (roll <= 82) return 'OUT_OF_STOCK';
  if (roll <= 92) return 'INACTIVE';
  if (roll <= 97) return 'SUSPENDED';
  return 'REMOVED';
}

/** Spread across three bands so price filters and sorting have something to bite on. */
function priceForIndex(index: number): number {
  if (index % 10 === 0) return int(8000, 50000);
  if (index % 3 === 0) return int(1000, 8000);
  return int(50, 1000);
}

// ------------------------------------------------------------------- carts

async function seedCarts(products: MockProduct[]) {
  const sellable = products.filter(
    (p) => p.status === 'ACTIVE' && p.stockQty > 0
  );
  // One cart is deliberately left holding a product its seller has since
  // deactivated, so the UI has an `issue` line to render.
  const broken = products.find((p) => p.status === 'INACTIVE');

  for (let index = 0; index < COUNTS.carts; index += 1) {
    const userId = MOCK_BUYER_IDS[index];
    const cartId = mockId(KIND.cart, index + 1);
    await prisma.cart.create({ data: { id: cartId, userId } });

    const chosen = new Map<string, number>();
    for (let n = 0; n < int(1, 3); n += 1) {
      const product = pick(sellable);
      // CART-001 — nobody carries their own listing.
      if (product.sellerId === userId) continue;
      chosen.set(product.id, Math.min(int(1, 3), product.stockQty));
    }
    if (index === 0 && broken) chosen.set(broken.id, 1);

    if (chosen.size === 0) continue;
    await prisma.cartItem.createMany({
      data: [...chosen].map(([productId, quantity]) => ({
        cartId,
        productId,
        quantity
      }))
    });
  }
}

// ------------------------------------------------------- orders + shipments

const SHIPMENT_TRAIL = {
  PROCESSING: ['PROCESSING'],
  SHIPPED: ['PROCESSING', 'SHIPPED'],
  IN_TRANSIT: ['PROCESSING', 'SHIPPED', 'IN_TRANSIT'],
  DELIVERED: ['PROCESSING', 'SHIPPED', 'IN_TRANSIT', 'DELIVERED'],
  CANCELLED: ['PROCESSING', 'CANCELLED']
} as const;

type ShipmentStatus = keyof typeof SHIPMENT_TRAIL;

async function seedOrders(products: MockProduct[]) {
  // Only sellable listings end up in order history, mirroring a real checkout.
  const sellable = products.filter((p) => p.status !== 'REMOVED');
  const notifications: Record<string, unknown>[] = [];
  let orderSeq = 0;
  let itemSeq = 0;

  for (let session = 0; session < COUNTS.checkoutSessions; session += 1) {
    const buyerId = pick(MOCK_BUYER_IDS);
    const checkoutSessionId = mockId(KIND.payment, 500 + session);
    const paymentId = mockId(KIND.payment, session + 1);

    // CART-004 — exactly one payment row per checkout, shared by every order.
    await prisma.paymentTransaction.create({
      data: {
        id: paymentId,
        checkoutSessionId,
        status: 'SUCCEEDED',
        method: pick(['CARD', 'BANK_TRANSFER', 'E_WALLET'])
      }
    });

    // CART-003 — one order per seller in the basket.
    const sellerCount = chance(30) ? int(2, 3) : 1;
    const sellers = new Set<string>();
    while (sellers.size < sellerCount) sellers.add(pick(MOCK_SELLER_IDS));

    for (const sellerId of sellers) {
      const candidates = sellable.filter(
        (p) => p.sellerId === sellerId && p.sellerId !== buyerId
      );
      if (candidates.length === 0) continue;

      orderSeq += 1;
      const orderId = mockId(KIND.order, orderSeq);
      const lines = uniqueBy(
        Array.from({ length: int(1, 3) }, () => pick(candidates)),
        (p) => p.id
      ).map((product) => ({
        product,
        quantity: int(1, 3),
        unitPrice: product.price
      }));

      const subtotal = lines.reduce(
        (sum, line) => sum + line.unitPrice * line.quantity,
        0
      );
      const cancelled = chance(12);
      const createdAt = daysAgo(int(1, 45));

      await prisma.order.create({
        data: {
          id: orderId,
          checkoutSessionId,
          sellerId,
          buyerId,
          paymentTransactionId: paymentId,
          subtotal: subtotal.toFixed(2),
          status: cancelled ? 'CANCELLED' : 'PAID',
          createdAt
        }
      });

      await prisma.orderItem.createMany({
        data: lines.map((line) => {
          itemSeq += 1;
          return {
            id: mockId(KIND.orderItem, itemSeq),
            orderId,
            productId: line.product.id,
            quantity: line.quantity,
            unitPrice: line.unitPrice.toFixed(2)
          };
        })
      });

      // CART-005 — the address is frozen onto the order at payment time.
      await prisma.orderAddress.create({
        data: {
          id: mockId(KIND.address, orderSeq),
          orderId,
          recipientName: `Recipient ${orderSeq}`,
          line1: `${int(1, 999)} ${pick(STREETS)}`,
          city: pick(CITIES),
          postalCode: String(int(10000, 90000)),
          phone: `08${int(10000000, 99999999)}`
        }
      });

      const status: ShipmentStatus = cancelled
        ? 'CANCELLED'
        : pickShipmentStatus();
      await seedShipment(orderId, orderSeq, status, createdAt);

      notifications.push(
        notification(
          buyerId,
          orderId,
          'ORDER_PLACED',
          'Order placed',
          createdAt
        ),
        notification(
          sellerId,
          orderId,
          'ORDER_PLACED',
          'New order received',
          createdAt
        )
      );
      for (const step of SHIPMENT_TRAIL[status].slice(1)) {
        notifications.push(
          notification(
            buyerId,
            orderId,
            'SHIPMENT_UPDATE',
            `Shipment ${step}`,
            createdAt
          )
        );
      }
      if (status === 'DELIVERED') {
        notifications.push(
          notification(
            buyerId,
            orderId,
            'DELIVERED',
            'Order delivered',
            createdAt
          )
        );
      }
    }
  }

  return notifications;
}

function pickShipmentStatus(): ShipmentStatus {
  const roll = int(1, 100);
  if (roll <= 20) return 'PROCESSING';
  if (roll <= 40) return 'SHIPPED';
  if (roll <= 60) return 'IN_TRANSIT';
  return 'DELIVERED';
}

async function seedShipment(
  orderId: string,
  seq: number,
  status: ShipmentStatus,
  orderedAt: Date
) {
  // Widened off the literal tuple so the steps stay usable as plain statuses.
  const trail: readonly ShipmentStatus[] = SHIPMENT_TRAIL[status];
  // SRS 1.2 — the tracking number is generated here, never fetched from a courier.
  const dispatched = trail.includes('SHIPPED');

  await prisma.shipment.create({
    data: {
      id: mockId(KIND.shipment, seq),
      orderId,
      status,
      trackingNumber: dispatched ? fakeTracking(orderedAt) : null,
      carrier: dispatched ? pick(CARRIERS) : null,
      createdAt: orderedAt
    }
  });

  // Append-only: one row per step actually taken, in order.
  await prisma.shipmentEvent.createMany({
    data: trail.map((eventType, step) => ({
      shipmentId: mockId(KIND.shipment, seq),
      eventType,
      // The first step is created by checkout itself, so it has no actor.
      actorUserId: null,
      createdAt: new Date(orderedAt.getTime() + step * 86_400_000)
    }))
  });
}

function fakeTracking(at: Date) {
  const yy = String(at.getFullYear()).slice(-2);
  const mm = String(at.getMonth() + 1).padStart(2, '0');
  const dd = String(at.getDate()).padStart(2, '0');
  let suffix = '';
  for (let i = 0; i < 6; i += 1) {
    suffix += TRACKING_ALPHABET[int(0, TRACKING_ALPHABET.length - 1)];
  }
  return `BN${yy}${mm}${dd}${suffix}`;
}

// ------------------------------------------------------------------- chat

async function seedConversations(products: MockProduct[]) {
  const notifications: Record<string, unknown>[] = [];
  const visible = products.filter((p) => p.status !== 'REMOVED');
  const seen = new Set<string>();
  let messageSeq = 0;

  for (let index = 0; index < COUNTS.conversations; index += 1) {
    const product = pick(visible);
    const buyerId = pick(MOCK_BUYER_IDS);
    // CHAT-001 — a seller never opens a thread against their own listing.
    if (product.sellerId === buyerId) continue;

    const key = `${product.id}:${buyerId}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const conversationId = mockId(KIND.conversation, index + 1);
    const startedAt = daysAgo(int(1, 20));
    await prisma.conversation.create({
      data: {
        id: conversationId,
        productId: product.id,
        buyerId,
        sellerId: product.sellerId,
        createdAt: startedAt
      }
    });

    const turns = int(3, 8);
    for (let turn = 0; turn < turns; turn += 1) {
      const fromBuyer = turn % 2 === 0;
      const senderId = fromBuyer ? buyerId : product.sellerId;
      const sentAt = new Date(startedAt.getTime() + turn * 3_600_000);
      messageSeq += 1;

      await prisma.message.create({
        data: {
          id: mockId(KIND.message, messageSeq),
          conversationId,
          senderId,
          body: fromBuyer
            ? BUYER_LINES[turn % BUYER_LINES.length]
            : SELLER_LINES[turn % SELLER_LINES.length],
          createdAt: sentAt,
          // Older turns are already read; the last one or two stay unread so the
          // conversation list has a non-zero badge to show.
          readAt: turn < turns - 2 ? sentAt : null
        }
      });

      if (turn >= turns - 2) {
        notifications.push({
          userId: fromBuyer ? product.sellerId : buyerId,
          conversationId,
          type: 'NEW_MESSAGE',
          title: 'New message',
          message: fromBuyer ? BUYER_LINES[0] : SELLER_LINES[0],
          createdAt: sentAt
        });
      }
    }
  }

  return notifications;
}

// ---------------------------------------------------------------- helpers

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000);

const notification = (
  userId: string,
  orderId: string,
  type: string,
  title: string,
  createdAt: Date
) => ({
  userId,
  orderId,
  type,
  title,
  message: `${title} — order ${orderId.slice(-6)}`,
  createdAt,
  readAt: chance(50) ? createdAt : null
});

function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
  const map = new Map<string, T>();
  for (const item of items) map.set(key(item), item);
  return [...map.values()];
}

// ------------------------------------------------------------------- main

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('seed-mock is for local development only');
  }

  await wipe();

  const users = await seedUsers();
  await seedCategories();
  const products = await seedProducts();
  await seedCarts(products);

  const orderNotifications = await seedOrders(products);
  const chatNotifications = await seedConversations(products);
  await prisma.notification.createMany({
    data: [...orderNotifications, ...chatNotifications] as never
  });

  // A few declined attempts that never became orders — the checkout path keeps
  // these on purpose so a charge is never lost.
  await prisma.paymentTransaction.createMany({
    data: Array.from({ length: COUNTS.failedPayments }, (_, i) => ({
      id: mockId(KIND.payment, 900 + i),
      checkoutSessionId: mockId(KIND.payment, 950 + i),
      status: 'FAILED' as const,
      method: 'CARD'
    }))
  });

  const counts = await tally();
  console.log('Mock data ready (dev only):');
  for (const [table, total] of Object.entries(counts)) {
    console.log(`  ${table.padEnd(14)} ${total}`);
  }
  printAccessTokens(users);
}

/**
 * AUTH-008 retired the x-mock-user-id header, so a bare id no longer gets past
 * the guard. These accounts carry no auth_accounts row — a real sign-in wants
 * an emailed OTP first (AUTH-007) — so mint the tokens here the way seed.ts
 * does. The guard only reads `sub` and re-reads the account every request, so
 * the suspended one really does behave as suspended.
 *
 * They expire on the usual JWT_ACCESS_TTL — re-run for fresh ones.
 */
function printAccessTokens(users: { id: string; email: string }[]) {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) {
    console.log('\nSet JWT_ACCESS_SECRET to also print bearer tokens.');
    return;
  }

  const jwt = new JwtService();
  // ms-style strings like '15m'; the env is a plain string, the option is not.
  const expiresIn = (process.env.JWT_ACCESS_TTL ??
    '15m') as JwtSignOptions['expiresIn'];
  const emails = new Map(users.map((user) => [user.id, user.email]));
  const actors: [string, string][] = [
    ['mockSeller', MOCK_SELLER_IDS[0]],
    ['mockBuyer', MOCK_BUYER_IDS[0]],
    ['mockBanned', MOCK_SUSPENDED_ID]
  ];

  console.log('\nBearer tokens — paste into test/http/_env.http:');
  for (const [name, id] of actors) {
    const token = jwt.sign(
      { sub: id, email: emails.get(id), role: 'USER' },
      { secret, expiresIn }
    );
    console.log(`@${name}Token = ${token}`);
  }
}

async function tally() {
  const [
    users,
    categories,
    products,
    images,
    carts,
    cartItems,
    payments,
    orders,
    items,
    shipments,
    events,
    conversations,
    messages,
    notifications
  ] = await Promise.all([
    prisma.user.count({ where: { id: { in: ALL_USER_IDS } } }),
    prisma.category.count({
      where: { id: { in: [...MOCK_CATEGORY_IDS, INACTIVE_CATEGORY_ID] } }
    }),
    prisma.product.count({ where: { id: { in: PRODUCT_IDS } } }),
    prisma.productImage.count({ where: { productId: { in: PRODUCT_IDS } } }),
    prisma.cart.count({ where: { userId: { in: ALL_USER_IDS } } }),
    prisma.cartItem.count({
      where: { cart: { userId: { in: ALL_USER_IDS } } }
    }),
    prisma.paymentTransaction.count({ where: { id: { in: PAYMENT_IDS } } }),
    prisma.order.count({ where: { buyerId: { in: ALL_USER_IDS } } }),
    prisma.orderItem.count({
      where: { order: { buyerId: { in: ALL_USER_IDS } } }
    }),
    prisma.shipment.count({
      where: { order: { buyerId: { in: ALL_USER_IDS } } }
    }),
    prisma.shipmentEvent.count({
      where: { shipment: { order: { buyerId: { in: ALL_USER_IDS } } } }
    }),
    prisma.conversation.count({ where: { buyerId: { in: ALL_USER_IDS } } }),
    prisma.message.count({
      where: { conversation: { buyerId: { in: ALL_USER_IDS } } }
    }),
    prisma.notification.count({ where: { userId: { in: ALL_USER_IDS } } })
  ]);

  return {
    users,
    categories,
    products,
    images,
    carts,
    cartItems,
    payments,
    orders,
    orderItems: items,
    shipments,
    shipmentEvents: events,
    conversations,
    messages,
    notifications
  };
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
