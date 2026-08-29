/**
 * DEV ONLY — a small, temporary set of ACTIVE auctions so the home page's
 * "hot" and "ending-soon" sections (AUC-008) have something to render
 * locally. The real auction domain seed belongs to whoever owns
 * `feat/auction-dev4` — this is scoped narrowly (10 rows, no schema
 * changes) and safe to delete once that lands.
 *
 * Points at `seed.ts`'s fixed seller/category ids rather than
 * `seed-mock.ts`'s — deliberately, not just for convenience: those are
 * the only ids `seed-mock.ts`'s `wipe()` never deletes. An auction FK'd to
 * a category `seed-mock.ts` *does* wipe would break that script's own
 * re-seed the moment one exists (found the hard way — its `category`
 * delete has no cascade, so a re-run would crash mid-wipe). Importing
 * `seed.ts`/`seed-mock.ts` as modules is deliberately avoided too: both
 * call their own `main()` at module scope, so importing either re-runs
 * a full wipe-and-reseed as a side effect. These four ids are copied as
 * plain literals instead.
 *
 * Fixed ids under kind "a1" so re-running replaces the same 10 rows.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import {
  findMockImages,
  fromExistingUrl,
  slugifyName,
  uploadMockImage
} from './mock-image-loader';
import { AUCTION_IMAGE_URLS } from './mock-image-urls';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL })
});

// Mirrors seed.ts — copied as literals rather than imported, see file comment above.
const SELLER_IDS = [
  '00000000-0000-4000-8000-000000000002', // Somchai Shop
  '00000000-0000-4000-8000-000000000003' // Malee Store
];
const CATEGORY_IDS = [
  '00000000-0000-4000-8000-000000000101', // Electronics
  '00000000-0000-4000-8000-000000000102', // Fashion
  '00000000-0000-4000-8000-000000000103' // Collectibles
];

const mockId = (kind: string, index: number) =>
  `00000000-0000-4000-8000-${kind}${String(index).padStart(10, '0')}`;

const AUCTION_KIND = 'a1';

type MockAuction = {
  title: string;
  description: string;
  condition: 'NEW' | 'USED';
  startingPrice: number;
  bidCount: number;
  minBidIncrement: number;
  /** Minutes from now until this auction's current close time. */
  endsInMinutes: number;
};

// Ascending by endsInMinutes so "ending-soon" reads as a real ranking.
const AUCTIONS: MockAuction[] = [
  {
    title: 'Vintage Seiko 5 Automatic Watch',
    description: '1970s automatic movement, recently serviced, leather strap.',
    condition: 'USED',
    startingPrice: 12000,
    bidCount: 18,
    minBidIncrement: 500,
    endsInMinutes: 8
  },
  {
    title: 'Limited Edition Sneakers, Size 42',
    description: 'Deadstock pair, box included, never worn outside.',
    condition: 'NEW',
    // Not 4500 — auction.e2e-spec.ts's reserve-leak checks use that exact
    // number as a sentinel and would false-positive on any public field
    // that happens to equal it, on any auction in the table.
    startingPrice: 4300,
    bidCount: 9,
    minBidIncrement: 200,
    endsInMinutes: 35
  },
  {
    title: 'Olympus OM-1 Film Camera',
    description: '35mm body with 50mm lens, light seals replaced.',
    condition: 'USED',
    startingPrice: 2800,
    bidCount: 6,
    minBidIncrement: 100,
    endsInMinutes: 90
  },
  {
    title: '1962 Classic Movie Poster, Framed',
    description: 'Original re-release print, minor edge wear.',
    condition: 'USED',
    startingPrice: 1500,
    bidCount: 4,
    minBidIncrement: 100,
    endsInMinutes: 240
  },
  {
    title: 'Handmade Teak Wood Dining Chair',
    description: 'Solid teak, hand-carved back panel, one of a kind.',
    condition: 'NEW',
    startingPrice: 3200,
    bidCount: 2,
    minBidIncrement: 200,
    endsInMinutes: 480
  },
  {
    title: 'Wireless Noise-Cancelling Headphones',
    description: 'Open box, all accessories included, 20-hour battery.',
    condition: 'NEW',
    startingPrice: 2200,
    // 22 put currentPrice + minBidIncrement (the next-bid floor) at exactly
    // 4500 — the same reserve-leak sentinel startingPrice above avoids.
    bidCount: 21,
    minBidIncrement: 100,
    endsInMinutes: 720
  },
  {
    title: 'Antique Brass Compass Set',
    description: 'Ship captain style, working needle, wooden case.',
    condition: 'USED',
    startingPrice: 900,
    bidCount: 0,
    minBidIncrement: 50,
    endsInMinutes: 1440
  },
  {
    title: 'Signed First-Edition Novel',
    description: 'Author signature on title page, dust jacket intact.',
    condition: 'USED',
    startingPrice: 5000,
    bidCount: 11,
    minBidIncrement: 250,
    endsInMinutes: 2000
  },
  {
    title: 'Hand-Thrown Ceramic Vase Set',
    description: 'Set of three, wood-fired glaze, studio pottery.',
    condition: 'NEW',
    startingPrice: 1800,
    bidCount: 3,
    minBidIncrement: 100,
    endsInMinutes: 4000
  },
  {
    title: 'Racing Bicycle Frame, Carbon Fibre',
    description: 'Frame only, size M, light scuffs on the down tube.',
    condition: 'USED',
    startingPrice: 15000,
    bidCount: 7,
    minBidIncrement: 500,
    endsInMinutes: 7200
  }
];

function currentPriceFor(auction: MockAuction): number {
  if (auction.bidCount === 0) return 0;
  return auction.startingPrice + auction.bidCount * auction.minBidIncrement;
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('seed-mock-auction is for local development only');
  }

  const now = Date.now();

  for (const [index, auction] of AUCTIONS.entries()) {
    const id = mockId(AUCTION_KIND, index + 1);
    const sellerId = SELLER_IDS[index % SELLER_IDS.length];
    const categoryId = CATEGORY_IDS[index % CATEGORY_IDS.length];
    const endsAt = new Date(now + auction.endsInMinutes * 60_000);
    const startedAt = new Date(now - (index + 1) * 3_600_000);

    // `endsInMinutes` is relative to "now" — *this* run's now, not the first
    // one. `update: {}` used to leave that first run's timestamps in place
    // forever, so an auction seeded with a short countdown (this file has a
    // few, on purpose, for "ending soon") would really end, a real
    // settlement job would really flip it to SOLD/UNSOLD, and no later
    // reseed ever brought it back. update mirrors create for exactly that
    // reason: a reseed is a full reset back to the pristine state the
    // AUCTIONS entry describes, not a patch on top of whatever happened to
    // this row since.
    const data = {
      sellerId,
      categoryId,
      title: auction.title,
      description: auction.description,
      condition: auction.condition,
      status: 'ACTIVE' as const,
      startingPrice: auction.startingPrice.toFixed(2),
      minBidIncrement: auction.minBidIncrement.toFixed(2),
      currentPrice: currentPriceFor(auction).toFixed(2),
      bidCount: auction.bidCount,
      originalEndAt: endsAt,
      currentEndAt: endsAt,
      publishedAt: startedAt,
      startedAt,
      endedAt: null,
      winnerUserId: null,
      winningBidId: null,
      soldPrice: null,
      extensionCount: 0,
      cancellationReason: null
    };

    await prisma.auction.upsert({
      where: { id },
      update: data,
      create: { id, ...data }
    });

    // Separate upserts, keyed on the same (auctionId, position) the schema
    // already makes unique, rather than nesting under `create` above — that
    // only runs the first time a row is created, so a photo added after the
    // auction row already exists would never be picked up.
    const slug = slugifyName(auction.title);
    const curatedUrls = AUCTION_IMAGE_URLS[slug] ?? [];
    const localFiles = findMockImages('auctions', slug);
    // AUC-001 — a listing needs at least one picture, curated or not. Up to 3,
    // same cap as a product's, now that the detail page's gallery can show more
    // than one (apps/web/src/app/auctions/[id]/page.tsx splits primary + rest).
    const desiredCount = Math.min(
      Math.max(curatedUrls.length, localFiles.length, 1),
      3
    );

    for (let position = 0; position < desiredCount; position += 1) {
      const curatedUrl = curatedUrls[position];
      const sourceFile = localFiles[position];
      const stored = curatedUrl
        ? fromExistingUrl(curatedUrl)
        : sourceFile
          ? await uploadMockImage(
              sourceFile,
              `bidnest-mock/auctions/${slug}/${position}`
            )
          : null;
      const image = {
        storageKey: stored?.storageKey ?? `seed-auction/${id}/${position}`,
        url:
          stored?.url ??
          `https://placehold.co/600x400?text=${encodeURIComponent(auction.title)}`,
        position,
        isPrimary: position === 0
      };

      await prisma.auctionImage.upsert({
        where: { auctionId_position: { auctionId: id, position } },
        create: { auctionId: id, ...image },
        update: image
      });
    }

    // A photo count that shrinks between runs (3 curated urls down to 1,
    // say) must not leave the higher positions behind as stale rows.
    await prisma.auctionImage.deleteMany({
      where: { auctionId: id, position: { gte: desiredCount } }
    });
  }

  const count = await prisma.auction.count({
    where: { id: { in: AUCTIONS.map((_, i) => mockId(AUCTION_KIND, i + 1)) } }
  });
  console.log(`Mock auctions ready (dev only): ${count} rows`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
