import type { ProductStatus } from '../../../generated/prisma/enums';

/**
 * PROD-003 — the statuses a buyer may see.
 *
 * An allow-list rather than "everything except REMOVED", so a status added
 * later stays private until somebody decides otherwise instead of becoming
 * public by omission. Same reasoning as `PUBLIC_AUCTION_STATUSES`.
 *
 * `OUT_OF_STOCK` is in it: a listing that sold out is still a listing, and
 * being able to follow one until it is restocked is most of the point of
 * following it. `INACTIVE` and `SUSPENDED` are not — those are a seller's
 * pause and an admin's takedown (ADM-005), and both mean "not on sale".
 */
export const PUBLIC_PRODUCT_STATUSES: ProductStatus[] = [
  'ACTIVE',
  'OUT_OF_STOCK'
];
