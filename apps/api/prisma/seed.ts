import 'dotenv/config';
import * as bcrypt from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';
import type { JwtSignOptions } from '@nestjs/jwt';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
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

async function seedUsers() {
  const users = [
    {
      id: ADMIN_ID,
      email: 'admin@bidnest.test',
      role: 'ADMIN' as const,
      firstName: 'Admin',
      displayName: 'BidNest Admin',
    },
    {
      id: SELLER_A_ID,
      email: 'seller-a@bidnest.test',
      role: 'USER' as const,
      firstName: 'Somchai',
      displayName: 'Somchai Shop',
    },
    {
      id: SELLER_B_ID,
      email: 'seller-b@bidnest.test',
      role: 'USER' as const,
      firstName: 'Malee',
      displayName: 'Malee Store',
    },
    {
      id: BUYER_ID,
      email: 'buyer@bidnest.test',
      role: 'USER' as const,
      firstName: 'Anan',
      displayName: 'Anan B.',
    },
  ];

  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 12);

  for (const { id, email, role, firstName, displayName } of users) {
    await prisma.user.upsert({
      where: { id },
      // Sets the password on a row that already exists from an earlier seed
      // run too, not only on first creation — re-running this is how an
      // already-seeded database picks it up.
      update: { passwordHash, emailVerifiedAt: new Date() },
      create: {
        id,
        email,
        role,
        status: 'ACTIVE',
        passwordHash,
        emailVerifiedAt: new Date(),
        profile: {
          create: {
            firstName,
            displayName,
            defaultShippingAddress: '123 Sukhumvit Rd, Bangkok 10110',
          },
        },
      },
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
      slug: 'collectibles',
    },
  ];

  for (const category of categories) {
    await prisma.category.upsert({
      where: { id: category.id },
      update: {},
      create: { ...category, isActive: true, createdByAdminId: ADMIN_ID },
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
      imageUrl: 'https://placehold.co/600x400?text=Keyboard',
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
      imageUrl: 'https://placehold.co/600x400?text=USB-C+Hub',
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
      imageUrl: 'https://placehold.co/600x400?text=Denim+Jacket',
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
      imageUrl: 'https://placehold.co/600x400?text=Figurine',
    },
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
            isPrimary: true,
          },
        },
      },
    });
  }
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
    ['buyer', BUYER_ID, 'buyer@bidnest.test', 'USER'],
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

  console.log(
    `Seeded accounts all share the password "${SEED_PASSWORD}" — sign in ` +
      'at /login with any of their emails, then read the OTP from Maildev ' +
      '(http://localhost:1080).'
  );
  printAccessTokens();
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
