export const ProductSort = {
  PRICE_ASC: 'price_asc',
  PRICE_DESC: 'price_desc',
  NEWEST: 'newest',
} as const;

export type ProductSort = (typeof ProductSort)[keyof typeof ProductSort];
