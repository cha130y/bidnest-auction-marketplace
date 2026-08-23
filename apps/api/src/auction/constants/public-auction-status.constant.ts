import type { AuctionStatus } from '../../../generated/prisma/enums';

/**
 * AUC-005 — the statuses a buyer may see. Written as an allow-list rather than
 * "everything except DRAFT" so a status added later stays private until
 * somebody decides otherwise, instead of becoming public by omission.
 *
 * Shared rather than repeated: the REST lookup and the realtime room have to
 * agree on what "public" means, or one of them becomes a way around the other.
 */
export const PUBLIC_AUCTION_STATUSES: AuctionStatus[] = [
  'SCHEDULED',
  'ACTIVE',
  'SOLD',
  'UNSOLD'
];
