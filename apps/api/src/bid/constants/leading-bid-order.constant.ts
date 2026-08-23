import type { Prisma } from '../../../generated/prisma/client';

/**
 * Which bid is winning: the highest amount, and on a tie whoever got there
 * first — which is what the sequence number records.
 *
 * Shared rather than repeated because two places ask the same question and
 * must not answer it differently: the arena names a leader while the auction
 * runs (LIV-002), and settlement picks the winner when it ends (AUC-007). A
 * screen that shows one person leading and then hands the auction to another
 * is worse than showing nothing.
 */
export const LEADING_BID_ORDER = [
  { amount: 'desc' },
  { sequenceNo: 'asc' }
] satisfies Prisma.BidOrderByWithRelationInput[];
