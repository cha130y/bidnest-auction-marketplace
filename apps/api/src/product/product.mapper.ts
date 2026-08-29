import type { Prisma } from '../../generated/prisma/client';

export const productPublicSelect = {
  id: true,
  sellerId: true,
  categoryId: true,
  title: true,
  description: true,
  price: true,
  stockQty: true,
  condition: true,
  status: true,
  quantityDiscountMinQty: true,
  quantityDiscountPercent: true,
  createdAt: true,
  updatedAt: true,
  images: {
    // The id is here so a seller's own screen can say which picture to
    // remove. It reaches buyers too, which costs nothing: it identifies a
    // public image and nothing else.
    select: { id: true, url: true, position: true, isPrimary: true },
    orderBy: { position: 'asc' }
  },
  category: { select: { id: true, name: true, slug: true } },
  seller: { select: { id: true, profile: { select: { displayName: true } } } }
} satisfies Prisma.ProductSelect;

// PROD-006 / §6 — negotiationFloor is added on top of the public select, never
// the other way round, so a buyer-facing path cannot leak it by omission.
export const productOwnerSelect = {
  ...productPublicSelect,
  negotiationFloor: true
} satisfies Prisma.ProductSelect;

type PublicProductRow = Prisma.ProductGetPayload<{
  select: typeof productPublicSelect;
}>;
type OwnerProductRow = Prisma.ProductGetPayload<{
  select: typeof productOwnerSelect;
}>;

export function toPublicProduct(product: PublicProductRow) {
  return {
    id: product.id,
    title: product.title,
    description: product.description,
    price: product.price.toString(),
    stockQty: product.stockQty,
    condition: product.condition,
    status: product.status,
    quantityDiscount:
      product.quantityDiscountMinQty && product.quantityDiscountPercent
        ? {
            minQty: product.quantityDiscountMinQty,
            percent: product.quantityDiscountPercent.toString()
          }
        : null,
    category: product.category,
    seller: {
      id: product.seller.id,
      displayName: product.seller.profile?.displayName ?? null
    },
    images: product.images.map((image) => ({
      id: image.id,
      url: image.url,
      position: image.position,
      isPrimary: image.isPrimary
    })),
    createdAt: product.createdAt,
    updatedAt: product.updatedAt
  };
}

export function toOwnerProduct(product: OwnerProductRow) {
  return {
    ...toPublicProduct(product),
    negotiationFloor: product.negotiationFloor?.toString() ?? null
  };
}
