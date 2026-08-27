import 'dotenv/config';
import * as bcrypt from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';
import type { JwtSignOptions } from '@nestjs/jwt';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL })
});

/**
 * Local dev/test only — every seeded actor shares this one password so
 * anybody on the team can sign in as any of them through the real /login
 * form (with the real OTP, from Maildev at localhost:1080) without hunting
 * for a per-account secret. Hashed the same way HashingService does
 * (bcryptjs, 12 rounds), so login compares against it exactly like a real
 * password.
 */
const SEED_PASSWORD = 'Test1234';

// Fixed UUIDs so the seeded actors stay stable across re-seeds
const ADMIN_ID = '00000000-0000-4000-8000-000000000001';
const SELLER_A_ID = '00000000-0000-4000-8000-000000000002';
const SELLER_B_ID = '00000000-0000-4000-8000-000000000003';
const BUYER_ID = '00000000-0000-4000-8000-000000000004';

const CATEGORY_ELECTRONICS_ID = '00000000-0000-4000-8000-000000000101';
const CATEGORY_FASHION_ID = '00000000-0000-4000-8000-000000000102';
const CATEGORY_COLLECTIBLES_ID = '00000000-0000-4000-8000-000000000103';

/**
 * AUC/BID/LIV fixtures — one auction per state a screen has to handle, so the
 * whole auction side can be opened and looked at without anybody first having
 * to create a draft, publish it and wait for a clock.
 *
 * `…03xx` for auctions, `…04xx` for bids, `…05xx` for the client request ids
 * bids carry, `…0601` for the one anti-sniping extension. Fixed like every
 * other id here, so a re-seed replaces these rows instead of adding more.
 */
const AUCTION = {
  draftIncomplete: '00000000-0000-4000-8000-000000000301',
  draftReady: '00000000-0000-4000-8000-000000000302',
  scheduled: '00000000-0000-4000-8000-000000000303',
  live: '00000000-0000-4000-8000-000000000304',
  closing: '00000000-0000-4000-8000-000000000305',
  suddenDeath: '00000000-0000-4000-8000-000000000306',
  sold: '00000000-0000-4000-8000-000000000307',
  unsold: '00000000-0000-4000-8000-000000000308',
  cancelled: '00000000-0000-4000-8000-000000000309',
  /**
   * The three below are the ones still standing tomorrow.
   *
   * Everything above is written to be looked at within the hour: the closing
   * and sudden-death pair are gone in minutes by design, the lobby opens in
   * three. That is right for testing a transition and wrong for everything
   * else — a teammate who seeded yesterday opened the home page to four empty
   * sections, because settlement had taken the last running auction hours
   * ago. These three keep the hot, ending-soon and starting-soon sections
   * answering for days at a time.
   */
  longRunning: '00000000-0000-4000-8000-000000000310',
  closingToday: '00000000-0000-4000-8000-000000000311',
  scheduledLater: '00000000-0000-4000-8000-000000000312'
} as const;

const AUCTION_IDS = Object.values(AUCTION);

const EXTENSION_ID = '00000000-0000-4000-8000-000000000601';

async function seedUsers() {
  const users = [
    {
      id: ADMIN_ID,
      email: 'admin@bidnest.test',
      role: 'ADMIN' as const,
      firstName: 'Admin',
      displayName: 'BidNest Admin'
    },
    {
      id: SELLER_A_ID,
      email: 'seller-a@bidnest.test',
      role: 'USER' as const,
      firstName: 'Somchai',
      displayName: 'Somchai Shop'
    },
    {
      id: SELLER_B_ID,
      email: 'seller-b@bidnest.test',
      role: 'USER' as const,
      firstName: 'Malee',
      displayName: 'Malee Store'
    },
    {
      id: BUYER_ID,
      email: 'buyer@bidnest.test',
      role: 'USER' as const,
      firstName: 'Anan',
      displayName: 'Anan B.'
    }
  ];

  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 12);

  for (const { id, email, role, firstName, displayName } of users) {
    /*
     * A complete default address, in the six fields checkout reads, so a
     * seeded account can go straight to paying without typing one out.
     */
    const address = {
      recipientName: displayName,
      phone: '0812345678',
      line1: '123 Sukhumvit Rd',
      line2: null,
      city: 'Bangkok',
      postalCode: '10110'
    };

    await prisma.user.upsert({
      where: { id },
      // Sets the password on a row that already exists from an earlier seed
      // run too, not only on first creation — re-running this is how an
      // already-seeded database picks it up.
      update: {
        passwordHash,
        emailVerifiedAt: new Date(),
        // And the address for the same reason. Putting it only in `create`
        // below would mean every database that had already been seeded once
        // kept whatever it had — which is exactly the machine this is meant to
        // fix, since the migration could only move the old free-text blob into
        // `line1` and had nothing to put in the other four fields.
        //
        // `upsert` rather than `update`: a user row can predate its profile.
        profile: {
          upsert: {
            create: { firstName, displayName, ...address },
            update: address
          }
        }
      },
      create: {
        id,
        email,
        role,
        status: 'ACTIVE',
        passwordHash,
        emailVerifiedAt: new Date(),
        profile: { create: { firstName, displayName, ...address } }
      }
    });
  }
}

async function seedCategories() {
  const categories = [
    { id: CATEGORY_ELECTRONICS_ID, name: 'Electronics', slug: 'electronics' },
    { id: CATEGORY_FASHION_ID, name: 'Fashion', slug: 'fashion' },
    {
      id: CATEGORY_COLLECTIBLES_ID,
      name: 'Collectibles',
      slug: 'collectibles'
    }
  ];

  for (const category of categories) {
    await prisma.category.upsert({
      where: { id: category.id },
      update: {},
      create: { ...category, isActive: true, createdByAdminId: ADMIN_ID }
    });
  }
}

async function seedProducts() {
  const products = [
    {
      id: '00000000-0000-4000-8000-000000000201',
      sellerId: SELLER_A_ID,
      categoryId: CATEGORY_ELECTRONICS_ID,
      title: 'Mechanical Keyboard 65%',
      description: 'Hot-swappable, gasket mount, used for two months.',
      price: '2500.00',
      stockQty: 10,
      condition: 'USED' as const,
      // PROD-006 — secret, must never appear in buyer-facing responses
      negotiationFloor: '2000.00',
      // PROD-007 — buy 3+, get 10% off
      quantityDiscountMinQty: 3,
      quantityDiscountPercent: '10.00',
      imageUrl: 'https://placehold.co/600x400?text=Keyboard'
    },
    {
      id: '00000000-0000-4000-8000-000000000202',
      sellerId: SELLER_A_ID,
      categoryId: CATEGORY_ELECTRONICS_ID,
      title: 'USB-C Hub 8-in-1',
      description: 'Brand new, sealed box.',
      price: '1200.00',
      stockQty: 5,
      condition: 'NEW' as const,
      negotiationFloor: null,
      quantityDiscountMinQty: null,
      quantityDiscountPercent: null,
      imageUrl: 'https://placehold.co/600x400?text=USB-C+Hub'
    },
    {
      id: '00000000-0000-4000-8000-000000000203',
      sellerId: SELLER_B_ID,
      categoryId: CATEGORY_FASHION_ID,
      title: 'Vintage Denim Jacket',
      description: 'Size M, 90s wash, excellent condition.',
      price: '1800.00',
      stockQty: 2,
      condition: 'USED' as const,
      negotiationFloor: '1500.00',
      quantityDiscountMinQty: null,
      quantityDiscountPercent: null,
      imageUrl: 'https://placehold.co/600x400?text=Denim+Jacket'
    },
    {
      id: '00000000-0000-4000-8000-000000000204',
      sellerId: SELLER_B_ID,
      categoryId: CATEGORY_COLLECTIBLES_ID,
      title: 'Limited Edition Figurine',
      description: 'Sealed, numbered 042/500.',
      price: '4500.00',
      stockQty: 1,
      condition: 'NEW' as const,
      negotiationFloor: null,
      quantityDiscountMinQty: null,
      quantityDiscountPercent: null,
      imageUrl: 'https://placehold.co/600x400?text=Figurine'
    }
  ];

  for (const { imageUrl, ...product } of products) {
    await prisma.product.upsert({
      where: { id: product.id },
      update: {},
      create: {
        ...product,
        status: 'ACTIVE',
        images: {
          create: {
            storageKey: `seed/${product.id}`,
            url: imageUrl,
            position: 0,
            isPrimary: true
          }
        }
      }
    });
  }
}

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** A bid as it was recorded when it landed. Every fixture bid is in the past. */
type SeedBid = {
  id: string;
  bidderId: string;
  amount: string;
  /** Offset from the moment the seed runs — negative, so it already happened. */
  placedAt: number;
};

type SeedAuction = {
  id: string;
  sellerId: string;
  categoryId: string;
  title: string;
  description: string;
  condition: 'NEW' | 'USED';
  status: 'DRAFT' | 'SCHEDULED' | 'ACTIVE' | 'SOLD' | 'UNSOLD' | 'CANCELLED';
  startingPrice: string;
  minBidIncrement: string;
  /** AUC-003 — the seller's own number; never leaves the API to a buyer. */
  reservePrice: string | null;
  /** All five below are offsets from now, in ms, or null where the state has none. */
  startAt: number | null;
  endAt: number | null;
  publishedAt: number | null;
  startedAt: number | null;
  endedAt: number | null;
  extensionCount?: number;
  cancellationReason?: string;
  images: string[];
  bids?: SeedBid[];
  watchedBy?: string[];
  joinedBy?: string[];
  /** What this row is here to let somebody look at. Printed after seeding. */
  note: string;
};

const image = (text: string) => `https://placehold.co/600x400?text=${text}`;

/**
 * One auction per state the auction side has to render.
 *
 * Times are offsets rather than dates because an auction only means anything
 * against the clock: a fixture written as a fixed timestamp is ACTIVE the day
 * it is committed and long over by the time anybody else pulls it. Re-running
 * the seed is what hands the next person a live one.
 */
const AUCTION_FIXTURES: SeedAuction[] = [
  {
    id: AUCTION.draftIncomplete,
    sellerId: SELLER_A_ID,
    categoryId: CATEGORY_ELECTRONICS_ID,
    title: 'Retro Game Console (ร่างยังไม่เสร็จ)',
    description: 'Boxed, works, needs a photo and a schedule before it can go.',
    condition: 'USED',
    status: 'DRAFT',
    startingPrice: '1500.00',
    minBidIncrement: '100.00',
    reservePrice: null,
    startAt: null,
    endAt: null,
    publishedAt: null,
    startedAt: null,
    endedAt: null,
    images: [],
    note: 'AUC-002 — the publish gate refuses this one: no image, no schedule'
  },
  {
    id: AUCTION.draftReady,
    sellerId: SELLER_A_ID,
    categoryId: CATEGORY_COLLECTIBLES_ID,
    title: 'Gundam RX-78-2 Perfect Grade',
    description: 'Sealed box, never opened. Bought two by mistake.',
    condition: 'NEW',
    status: 'DRAFT',
    startingPrice: '4000.00',
    minBidIncrement: '200.00',
    reservePrice: '6000.00',
    startAt: DAY,
    endAt: DAY + 2 * HOUR,
    publishedAt: null,
    startedAt: null,
    endedAt: null,
    images: [image('Gundam+PG'), image('Gundam+Box')],
    note: 'AUC-002/AUC-004 — complete, so preview and publish both work'
  },
  {
    id: AUCTION.scheduled,
    sellerId: SELLER_A_ID,
    categoryId: CATEGORY_FASHION_ID,
    title: 'Levi’s 501 Big E (1970s)',
    description: 'W32 L34, single stitch, honest fade.',
    condition: 'USED',
    status: 'SCHEDULED',
    startingPrice: '2500.00',
    minBidIncrement: '100.00',
    reservePrice: '4000.00',
    startAt: 3 * MINUTE,
    endAt: 33 * MINUTE,
    publishedAt: -2 * HOUR,
    startedAt: null,
    endedAt: null,
    images: [image('Levis+501'), image('Levis+Tag')],
    watchedBy: [BUYER_ID],
    note: 'LIV-001 — the lobby; AuctionLifecycleService opens it in ~3 minutes'
  },
  {
    id: AUCTION.live,
    sellerId: SELLER_A_ID,
    categoryId: CATEGORY_COLLECTIBLES_ID,
    title: 'Vintage Seiko 5 Automatic',
    description: 'Serviced last year, original bracelet, runs +8s/day.',
    condition: 'USED',
    status: 'ACTIVE',
    startingPrice: '3000.00',
    minBidIncrement: '100.00',
    reservePrice: '3400.00',
    startAt: -90 * MINUTE,
    endAt: 45 * MINUTE,
    publishedAt: -3 * HOUR,
    startedAt: -90 * MINUTE,
    endedAt: null,
    images: [image('Seiko+5'), image('Seiko+Dial'), image('Seiko+Back')],
    bids: [
      {
        id: '00000000-0000-4000-8000-000000000401',
        bidderId: BUYER_ID,
        amount: '3000.00',
        placedAt: -80 * MINUTE
      },
      {
        id: '00000000-0000-4000-8000-000000000402',
        bidderId: SELLER_B_ID,
        amount: '3200.00',
        placedAt: -55 * MINUTE
      },
      {
        id: '00000000-0000-4000-8000-000000000403',
        bidderId: BUYER_ID,
        amount: '3500.00',
        placedAt: -12 * MINUTE
      }
    ],
    watchedBy: [BUYER_ID],
    joinedBy: [BUYER_ID, SELLER_B_ID],
    note: 'LIV-002/BID-001 — the arena with room to bid, reserve already met'
  },
  {
    id: AUCTION.closing,
    sellerId: SELLER_B_ID,
    categoryId: CATEGORY_FASHION_ID,
    title: 'Carhartt Detroit Jacket',
    description: 'Size L, broken in, no repairs.',
    condition: 'USED',
    status: 'ACTIVE',
    startingPrice: '800.00',
    minBidIncrement: '50.00',
    reservePrice: '1500.00',
    startAt: -4 * HOUR,
    endAt: 3 * MINUTE,
    publishedAt: -5 * HOUR,
    startedAt: -4 * HOUR,
    endedAt: null,
    images: [image('Carhartt')],
    bids: [
      {
        id: '00000000-0000-4000-8000-000000000411',
        bidderId: BUYER_ID,
        amount: '800.00',
        placedAt: -3 * HOUR
      },
      {
        id: '00000000-0000-4000-8000-000000000412',
        bidderId: SELLER_A_ID,
        amount: '900.00',
        placedAt: -40 * MINUTE
      }
    ],
    watchedBy: [BUYER_ID],
    note:
      'BID-004 — enters the closing window a minute after seeding (amber), ' +
      'and its reserve is still unmet'
  },
  {
    id: AUCTION.suddenDeath,
    sellerId: SELLER_B_ID,
    categoryId: CATEGORY_COLLECTIBLES_ID,
    title: 'Pokémon Base Set Charizard (PSA 6)',
    description: 'Graded, in its original slab.',
    condition: 'USED',
    status: 'ACTIVE',
    startingPrice: '5000.00',
    minBidIncrement: '250.00',
    reservePrice: '5500.00',
    startAt: -2 * HOUR,
    // Already extended once, so this end time is two minutes past the drafted
    // one — the same arithmetic calculate-anti-sniping does.
    endAt: 150 * 1000,
    publishedAt: -3 * HOUR,
    startedAt: -2 * HOUR,
    endedAt: null,
    extensionCount: 1,
    images: [image('Charizard'), image('PSA+Slab')],
    bids: [
      {
        id: '00000000-0000-4000-8000-000000000421',
        bidderId: BUYER_ID,
        amount: '5000.00',
        placedAt: -100 * MINUTE
      },
      {
        id: '00000000-0000-4000-8000-000000000422',
        bidderId: SELLER_A_ID,
        amount: '5250.00',
        placedAt: -60 * MINUTE
      },
      {
        id: '00000000-0000-4000-8000-000000000423',
        bidderId: BUYER_ID,
        amount: '5500.00',
        placedAt: -20 * MINUTE
      },
      // The bid that bought everyone two more minutes
      {
        id: '00000000-0000-4000-8000-000000000424',
        bidderId: SELLER_A_ID,
        amount: '6000.00',
        placedAt: -30 * 1000
      }
    ],
    joinedBy: [BUYER_ID],
    note: 'BID-004/LIV-003 — sudden death, one extension already granted (red)'
  },
  {
    id: AUCTION.sold,
    sellerId: SELLER_A_ID,
    categoryId: CATEGORY_COLLECTIBLES_ID,
    title: 'Omega Seamaster 300 (1964 re-issue)',
    description: 'Full set, papers included.',
    condition: 'USED',
    status: 'SOLD',
    startingPrice: '2000.00',
    minBidIncrement: '100.00',
    reservePrice: '2500.00',
    startAt: -6 * HOUR,
    endAt: -2 * HOUR,
    publishedAt: -8 * HOUR,
    startedAt: -6 * HOUR,
    endedAt: -2 * HOUR,
    images: [image('Omega'), image('Omega+Papers')],
    bids: [
      {
        id: '00000000-0000-4000-8000-000000000431',
        bidderId: BUYER_ID,
        amount: '2000.00',
        placedAt: -5 * HOUR
      },
      {
        id: '00000000-0000-4000-8000-000000000432',
        bidderId: SELLER_B_ID,
        amount: '2400.00',
        placedAt: -4 * HOUR
      },
      {
        id: '00000000-0000-4000-8000-000000000433',
        bidderId: BUYER_ID,
        amount: '2800.00',
        placedAt: -2 * HOUR - 30 * 1000
      }
    ],
    note: 'AUC-007/LIV-004 — the result screen with a winner (buyer@bidnest.test)'
  },
  {
    id: AUCTION.unsold,
    sellerId: SELLER_B_ID,
    categoryId: CATEGORY_ELECTRONICS_ID,
    title: 'iPad Air 4 64GB',
    description: 'Battery at 89%, small scuff on the corner.',
    condition: 'USED',
    status: 'UNSOLD',
    startingPrice: '1000.00',
    minBidIncrement: '100.00',
    reservePrice: '3000.00',
    startAt: -5 * HOUR,
    endAt: -45 * MINUTE,
    publishedAt: -6 * HOUR,
    startedAt: -5 * HOUR,
    endedAt: -45 * MINUTE,
    images: [image('iPad+Air')],
    bids: [
      {
        id: '00000000-0000-4000-8000-000000000441',
        bidderId: BUYER_ID,
        amount: '1000.00',
        placedAt: -4 * HOUR
      },
      {
        id: '00000000-0000-4000-8000-000000000442',
        bidderId: SELLER_A_ID,
        amount: '1200.00',
        placedAt: -2 * HOUR
      }
    ],
    note: 'AUC-007 — bids that never reached the reserve, so nobody won'
  },
  {
    id: AUCTION.cancelled,
    sellerId: SELLER_A_ID,
    categoryId: CATEGORY_ELECTRONICS_ID,
    title: 'Sony WH-1000XM4',
    description: 'Changed my mind — kept them.',
    condition: 'USED',
    status: 'CANCELLED',
    startingPrice: '4500.00',
    minBidIncrement: '200.00',
    reservePrice: null,
    startAt: 2 * HOUR,
    endAt: 5 * HOUR,
    publishedAt: -DAY,
    startedAt: null,
    endedAt: -30 * MINUTE,
    cancellationReason: 'Sold it to a friend before the auction opened',
    images: [image('WH-1000XM4')],
    note: 'AUC-006 — cancelled before it opened; visible only to its seller'
  },
  {
    id: AUCTION.longRunning,
    sellerId: SELLER_B_ID,
    categoryId: CATEGORY_COLLECTIBLES_ID,
    title: 'Leica M6 Classic (1988)',
    description: 'Meter accurate, brassing on the edges, recent CLA.',
    condition: 'USED',
    status: 'ACTIVE',
    startingPrice: '45000.00',
    minBidIncrement: '1000.00',
    reservePrice: '60000.00',
    startAt: -2 * DAY,
    endAt: 3 * DAY,
    publishedAt: -3 * DAY,
    startedAt: -2 * DAY,
    endedAt: null,
    images: [image('Leica+M6'), image('Leica+Top'), image('Leica+Lens')],
    // The most bid-on auction in the set, which is what puts it at the head of
    // the hot list — AUC-008 ranks that section by accepted bids.
    bids: [
      {
        id: '00000000-0000-4000-8000-000000000451',
        bidderId: BUYER_ID,
        amount: '45000.00',
        placedAt: -2 * DAY + HOUR
      },
      {
        id: '00000000-0000-4000-8000-000000000452',
        bidderId: SELLER_A_ID,
        amount: '48000.00',
        placedAt: -DAY - 6 * HOUR
      },
      {
        id: '00000000-0000-4000-8000-000000000453',
        bidderId: BUYER_ID,
        amount: '52000.00',
        placedAt: -DAY
      },
      {
        id: '00000000-0000-4000-8000-000000000454',
        bidderId: SELLER_A_ID,
        amount: '55000.00',
        placedAt: -8 * HOUR
      },
      {
        id: '00000000-0000-4000-8000-000000000455',
        bidderId: BUYER_ID,
        amount: '58000.00',
        placedAt: -2 * HOUR
      }
    ],
    watchedBy: [BUYER_ID],
    note: 'AUC-008 — tops the hot list and stays up for three days; reserve not met yet'
  },
  {
    id: AUCTION.closingToday,
    sellerId: SELLER_A_ID,
    categoryId: CATEGORY_FASHION_ID,
    title: 'Barbour Bedale (waxed, size 40)',
    description: 're-waxed last winter, no tears.',
    condition: 'USED',
    status: 'ACTIVE',
    startingPrice: '3200.00',
    minBidIncrement: '200.00',
    reservePrice: '4000.00',
    startAt: -6 * HOUR,
    endAt: 8 * HOUR,
    publishedAt: -DAY,
    startedAt: -6 * HOUR,
    endedAt: null,
    images: [image('Barbour+Bedale')],
    bids: [
      {
        id: '00000000-0000-4000-8000-000000000461',
        bidderId: BUYER_ID,
        amount: '3200.00',
        placedAt: -5 * HOUR
      },
      {
        id: '00000000-0000-4000-8000-000000000462',
        bidderId: SELLER_B_ID,
        amount: '4200.00',
        placedAt: -90 * MINUTE
      }
    ],
    note: 'AUC-008 — leads ending-soon for the rest of the day, reserve met'
  },
  {
    id: AUCTION.scheduledLater,
    sellerId: SELLER_B_ID,
    categoryId: CATEGORY_ELECTRONICS_ID,
    title: 'Technics SL-1200MK2 (pair)',
    description: 'Both serviced, new pitch faders, cartridges not included.',
    condition: 'USED',
    status: 'SCHEDULED',
    startingPrice: '28000.00',
    minBidIncrement: '500.00',
    reservePrice: '35000.00',
    startAt: 6 * HOUR,
    endAt: 2 * DAY,
    publishedAt: -4 * HOUR,
    startedAt: null,
    endedAt: null,
    images: [image('SL-1200MK2'), image('SL-1200+Platter')],
    watchedBy: [BUYER_ID],
    note: 'AUC-008 — keeps starting-soon answering after the three-minute lobby opens'
  }
];

/**
 * AUC-001..008 / BID-001..005 / LIV-001..005 — the auction fixtures.
 *
 * Deleted and rebuilt rather than upserted, which is the one thing here that
 * does not follow the pattern above. Users, categories and products are facts
 * that keep; an auction is a clock, and leaving an old row alone would mean
 * re-seeding gives you the same auction that ran out two days ago. Everything
 * removed is scoped to these fixed ids, so anything the team created by hand
 * survives a re-seed.
 */
async function seedAuctions() {
  // Foreign-key order. Only `bids` and the log rows need saying: images,
  // watchlist rows and participants cascade with the auction, and the auction
  // has to let go of its winning bid before that bid can be deleted.
  await prisma.auctionEvent.deleteMany({
    where: { auctionId: { in: AUCTION_IDS } }
  });
  await prisma.auctionExtension.deleteMany({
    where: { auctionId: { in: AUCTION_IDS } }
  });
  await prisma.notification.deleteMany({
    where: { auctionId: { in: AUCTION_IDS } }
  });
  await prisma.adminAction.deleteMany({
    where: { auctionId: { in: AUCTION_IDS } }
  });
  await prisma.conversation.deleteMany({
    where: { auctionId: { in: AUCTION_IDS } }
  });
  await prisma.auction.updateMany({
    where: { id: { in: AUCTION_IDS } },
    data: { winningBidId: null }
  });
  await prisma.bid.deleteMany({ where: { auctionId: { in: AUCTION_IDS } } });
  await prisma.auction.deleteMany({ where: { id: { in: AUCTION_IDS } } });

  const now = Date.now();
  const at = (offset: number | null) =>
    offset === null ? null : new Date(now + offset);

  for (const fixture of AUCTION_FIXTURES) {
    const bids = fixture.bids ?? [];
    // The highest bid is the leader, and on a tie the earliest — the rule
    // LEADING_BID_ORDER states for the arena and for settlement alike. The
    // fixtures are written in ascending order, so this is the last of them.
    const leading = bids[bids.length - 1];
    const sold = fixture.status === 'SOLD';

    await prisma.auction.create({
      data: {
        id: fixture.id,
        sellerId: fixture.sellerId,
        categoryId: fixture.categoryId,
        title: fixture.title,
        description: fixture.description,
        condition: fixture.condition,
        status: fixture.status,
        startingPrice: fixture.startingPrice,
        minBidIncrement: fixture.minBidIncrement,
        reservePrice: fixture.reservePrice,
        // `currentPrice` stays 0 until somebody bids — calculate-minimum-bid
        // reads exactly that to decide whether the floor is the starting price
        // or the last bid plus one increment.
        currentPrice: leading?.amount ?? '0',
        bidCount: bids.length,
        scheduledStartAt: at(fixture.startAt),
        // Both end columns are the drafted end until anti-sniping moves one of
        // them, so the extended fixture is the only place they differ.
        originalEndAt: at(
          fixture.extensionCount
            ? fixture.endAt! - fixture.extensionCount * 2 * MINUTE
            : fixture.endAt
        ),
        currentEndAt: at(fixture.endAt),
        publishedAt: at(fixture.publishedAt),
        startedAt: at(fixture.startedAt),
        endedAt: at(fixture.endedAt),
        extensionCount: fixture.extensionCount ?? 0,
        cancellationReason: fixture.cancellationReason,
        images: {
          create: fixture.images.map((url, index) => ({
            storageKey: `seed/${fixture.id}/${index}`,
            url,
            position: index,
            isPrimary: index === 0
          }))
        },
        watchlists: {
          create: (fixture.watchedBy ?? []).map((userId) => ({ userId }))
        },
        participants: {
          create: (fixture.joinedBy ?? []).map((userId) => ({
            userId,
            status: 'JOINED' as const,
            lastSeenAt: new Date(now)
          }))
        }
      }
    });

    await prisma.bid.createMany({
      data: bids.map((bid, index) => ({
        id: bid.id,
        auctionId: fixture.id,
        bidderId: bid.bidderId,
        amount: bid.amount,
        // What BidService writes: the count before this bid, plus one.
        sequenceNo: index + 1,
        // BID-002 — the idempotency key the client sent. Derived from the bid
        // id so a re-seed writes the same one rather than a fresh conflict.
        clientRequestId: bid.id.replace(
          '-4000-8000-0000000004',
          '-4000-8000-0000000005'
        ),
        placedAt: new Date(now + bid.placedAt)
      }))
    });

    if (sold && leading) {
      await prisma.auction.update({
        where: { id: fixture.id },
        data: {
          winnerUserId: leading.bidderId,
          winningBidId: leading.id,
          soldPrice: leading.amount
        }
      });
    }

    // BID-004 — the row the extension wrote, without which `extensionCount`
    // above would be a number with no history behind it.
    if (fixture.extensionCount && leading) {
      await prisma.auctionExtension.create({
        data: {
          id: EXTENSION_ID,
          auctionId: fixture.id,
          triggeredByBidId: leading.id,
          extensionNumber: 1,
          previousEndAt: at(fixture.endAt! - 2 * MINUTE)!,
          newEndAt: at(fixture.endAt)!
        }
      });
    }

    // The history the auction would have accumulated on its way to this state.
    await prisma.auctionEvent.createMany({
      data: [
        {
          auctionId: fixture.id,
          actorUserId: fixture.sellerId,
          eventType: 'CREATED' as const
        },
        ...(fixture.publishedAt !== null
          ? [
              {
                auctionId: fixture.id,
                actorUserId: fixture.sellerId,
                eventType: 'PUBLISHED' as const
              }
            ]
          : []),
        ...(fixture.startedAt !== null
          ? [{ auctionId: fixture.id, eventType: 'STARTED' as const }]
          : []),
        ...bids.map((bid) => ({
          auctionId: fixture.id,
          actorUserId: bid.bidderId,
          bidId: bid.id,
          eventType: 'BID_PLACED' as const
        })),
        ...(fixture.extensionCount && leading
          ? [
              {
                auctionId: fixture.id,
                bidId: leading.id,
                eventType: 'EXTENDED' as const
              }
            ]
          : []),
        ...(fixture.status === 'SOLD' || fixture.status === 'UNSOLD'
          ? [
              {
                auctionId: fixture.id,
                bidId: leading?.id,
                eventType: 'ENDED' as const
              }
            ]
          : []),
        ...(fixture.status === 'CANCELLED'
          ? [
              {
                auctionId: fixture.id,
                actorUserId: fixture.sellerId,
                eventType: 'CANCELLED' as const
              }
            ]
          : [])
      ]
    });
  }
}

/** What was seeded and where to look at it, since the ids say nothing. */
function printAuctionGuide() {
  console.log(
    '\nAuction fixtures — /auctions/<id>, or /sell/<id> for a draft:'
  );
  for (const fixture of AUCTION_FIXTURES) {
    const where = fixture.status === 'DRAFT' ? '/sell/' : '/auctions/';
    console.log(`  ${fixture.status.padEnd(9)} ${where}${fixture.id}`);
    console.log(`            ${fixture.note}`);
  }
  console.log(
    '\n  The closing and sudden-death ones are on a short clock on purpose:\n' +
      '  bid on them to push the deadline out, or re-seed for a fresh pair.'
  );
}

/**
 * AUTH-008 replaced the x-mock-user-id header with real bearer tokens, so the
 * .http collections need a token rather than a raw id. Printing them here
 * keeps manual testing a copy-paste away: signing in for real would mean
 * fetching an emailed OTP first (AUTH-007).
 *
 * They expire on the normal JWT_ACCESS_TTL — re-run the seed for fresh ones.
 */
function printAccessTokens() {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) {
    console.log('Seed complete. Set JWT_ACCESS_SECRET to also print tokens.');
    return;
  }

  const jwt = new JwtService();
  // ms-style strings like '15m'; the env is a plain string, the option is not.
  const expiresIn = (process.env.JWT_ACCESS_TTL ??
    '15m') as JwtSignOptions['expiresIn'];
  const actors: [string, string, string, string][] = [
    ['admin', ADMIN_ID, 'admin@bidnest.test', 'ADMIN'],
    ['sellerA', SELLER_A_ID, 'seller-a@bidnest.test', 'USER'],
    ['sellerB', SELLER_B_ID, 'seller-b@bidnest.test', 'USER'],
    ['buyer', BUYER_ID, 'buyer@bidnest.test', 'USER']
  ];

  console.log('Seed complete. Paste these into test/http/_env.http:');
  for (const [name, id, email, role] of actors) {
    const token = jwt.sign({ sub: id, email, role }, { secret, expiresIn });
    console.log(`@${name}Token = ${token}`);
  }
}

async function main() {
  await seedUsers();
  await seedCategories();
  await seedProducts();
  await seedAuctions();

  console.log(
    `Seeded accounts all share the password "${SEED_PASSWORD}" — sign in ` +
      'at /login with any of their emails, then read the OTP from Maildev ' +
      '(http://localhost:1080).'
  );
  printAccessTokens();
  printAuctionGuide();
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
