import { PrismaService } from './../../src/prisma/prisma.service';

/**
 * Moves an auction's schedule to where a test needs it, straight in the
 * database.
 *
 * A seller cannot *write* a schedule that has already gone by: the create and
 * update DTOs refuse one, because a time already past is never what anybody
 * meant to type. But an auction whose start has *since* arrived is completely
 * ordinary — it is what every auction now running once was. A fixture that
 * needs one therefore has to age it rather than write it, which is also the
 * honest account of how it happens: a schedule that was valid, and then time
 * passing.
 *
 *   const id = await createDraft({ scheduledStartAt: hoursFromNow(1) });
 *   await backdateSchedule(prisma, id, {
 *     startAt: hoursAgo(1),
 *     endAt: hoursFromNow(4)
 *   });
 *
 * `currentEndAt` moves with `originalEndAt`, as it does on a draft the API has
 * just written: anti-sniping (BID-004) is the only thing allowed to separate
 * the two, and a fixture is not anti-sniping.
 */
export async function backdateSchedule(
  prisma: PrismaService,
  auctionId: string,
  schedule: { startAt: Date; endAt: Date }
): Promise<void> {
  await prisma.auction.update({
    where: { id: auctionId },
    data: {
      scheduledStartAt: schedule.startAt,
      originalEndAt: schedule.endAt,
      currentEndAt: schedule.endAt
    }
  });
}
