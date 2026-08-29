import type { Prisma } from '../../../generated/prisma/client';

/**
 * NOT-003 / NOT-004 — everybody with a stake in one auction: whoever bid on it
 * and whoever was watching it.
 *
 * Both lists are read rather than one, because they answer different
 * questions — somebody can watch an auction without ever bidding, and can bid
 * on one they never added to a watchlist — and they are deduplicated, because
 * a person who did both is still one person and should hear once.
 *
 * Takes the transaction client so the audience is read inside the same
 * transaction that raised the event: a bid landing while an auction is being
 * cancelled either counts or does not, with no window where it half does.
 */
export async function findAuctionAudience(
  tx: Prisma.TransactionClient,
  auctionId: string,
  exclude: (string | null | undefined)[] = []
): Promise<string[]> {
  // Read one at a time rather than with Promise.all: `tx` is a single
  // connection pinned for the life of the transaction, and two queries in
  // flight on one pg client is the pattern pg deprecates and removes in 9.0.
  // Prisma's own interpreter still does this within a single call, which is
  // upstream noise — this is the one instance our code controls, and the extra
  // round trip costs nothing beside the settlement it runs inside.
  const bidders = await tx.bid.findMany({
    where: { auctionId },
    select: { bidderId: true },
    distinct: ['bidderId']
  });

  const watchers = await tx.watchlist.findMany({
    where: { auctionId },
    select: { userId: true }
  });

  const excluded = new Set(exclude.filter((id): id is string => Boolean(id)));
  const audience = new Set<string>();

  for (const { bidderId } of bidders) {
    if (!excluded.has(bidderId)) audience.add(bidderId);
  }

  for (const { userId } of watchers) {
    if (!excluded.has(userId)) audience.add(userId);
  }

  return [...audience];
}
