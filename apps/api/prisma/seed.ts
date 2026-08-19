import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

// Fixed UUIDs so `x-mock-user-id` headers stay stable across re-seeds
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

  for (const { id, email, role, firstName, displayName } of users) {
    await prisma.user.upsert({
      where: { id },
      update: {},
      create: {
        id,
        email,
        role,
        status: 'ACTIVE',
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

async function main() {
  await seedUsers();
  await seedCategories();
  await seedProducts();

  console.log('Seed complete. Use these ids in the x-mock-user-id header:');
  console.log(`  admin    ${ADMIN_ID}`);
  console.log(`  seller-a ${SELLER_A_ID}`);
  console.log(`  seller-b ${SELLER_B_ID}`);
  console.log(`  buyer    ${BUYER_ID}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
