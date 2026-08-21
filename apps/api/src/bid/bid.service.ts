import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuctionGateway } from '../realtime/auction.gateway';
import { toBidAcceptedEvent } from './bid-accepted-event.mapper';
import { bidSelect, toOwnBid } from './bid.mapper';
import { PlaceBidDto } from './dtos/place-bid.dto';
import { calculateMinimumBid } from './utils/calculate-minimum-bid.util';

@Injectable()
export class BidService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: AuctionGateway
  ) {}

  /**
   * BID-001 — accepts a bid, or explains why it will not.
   *
   * Every check and every write happens inside one transaction (BID-002): the
   * amount is judged against the price it will replace, and the auction is
   * updated only if it is still exactly as it was when that judgement was made.
   * A bid row therefore only ever exists for a bid that was accepted — there is
   * no rejected-bid state to filter out later.
   *
   * The bidder being an active USER is settled before this runs: the guard
   * rejects a suspended account, and @Roles keeps admins out entirely.
   */
  async placeBid(auctionId: string, bidderId: string, dto: PlaceBidDto) {
    const amount = new Prisma.Decimal(dto.amount);
    const now = new Date();

    try {
      const outcome = await this.placeBidInTransaction(
        auctionId,
        bidderId,
        dto,
        { amount, now }
      );

      // BID-003 / SRS section 6 — the broadcast happens here, outside the
      // transaction, because it is only true once the write has committed.
      // Announcing from inside would publish a bid a rollback could undo, and
      // there is no unsending it. A replayed retry rebroadcasts nothing: that
      // bid was announced when it was first accepted.
      if (outcome.broadcast) {
        this.gateway.emitToAuction(auctionId, 'auction:bid', outcome.broadcast);
      }

      return outcome.bid;
    } catch (error: unknown) {
      // BID-002 — two copies of the same retry can both get past the lookup
      // and reach the insert together. The unique index stops the second one,
      // and the first has by then committed a bid this caller can be given.
      if (isUniqueViolation(error, 'client_request_id')) {
        return this.replayExistingBid(dto.clientRequestId, auctionId, amount);
      }

      throw error;
    }
  }

  private async placeBidInTransaction(
    auctionId: string,
    bidderId: string,
    dto: PlaceBidDto,
    context: { amount: Prisma.Decimal; now: Date }
  ) {
    const { amount, now } = context;

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.bid.findUnique({
        where: { clientRequestId: dto.clientRequestId },
        select: bidSelect
      });

      // BID-002 — a retry after a dropped connection is the same bid, not a
      // new one. Handing back what was already recorded means a caller who
      // never saw the first answer ends up in the right state either way,
      // which returning an error could not do: they cannot tell a rejected
      // bid from an accepted one they simply did not hear about.
      if (existing) {
        return { bid: replayOrRefuse(existing, auctionId, amount) };
      }

      const auction = await tx.auction.findFirst({
        where: { id: auctionId, deletedAt: null },
        select: {
          id: true,
          sellerId: true,
          status: true,
          startingPrice: true,
          minBidIncrement: true,
          currentPrice: true,
          bidCount: true,
          currentEndAt: true,
          rowVersion: true
        }
      });

      if (!auction) throw new NotFoundException('Auction not found');

      if (auction.status !== 'ACTIVE') {
        throw new ConflictException('This auction is not open for bidding');
      }

      // An auction whose time is up but which the lifecycle pass has not
      // reached yet must not take another bid (AUC-007).
      if (
        !auction.currentEndAt ||
        auction.currentEndAt.getTime() <= now.getTime()
      ) {
        throw new ConflictException('This auction has ended');
      }

      if (auction.sellerId === bidderId) {
        throw new ForbiddenException(
          'A seller cannot bid on their own auction'
        );
      }

      const minimum = calculateMinimumBid(auction);

      if (amount.lt(minimum)) {
        throw new BadRequestException(
          `Bid must be at least ${minimum.toFixed(2)}`
        );
      }

      const { count } = await tx.auction.updateMany({
        // rowVersion is the whole guard: if anything about this auction changed
        // between the read above and here — another bid, a settlement — the
        // update matches nothing and this bid is refused rather than applied to
        // a price that no longer exists.
        where: {
          id: auctionId,
          status: 'ACTIVE',
          currentEndAt: { gt: now },
          deletedAt: null,
          rowVersion: auction.rowVersion
        },
        data: {
          currentPrice: amount,
          bidCount: { increment: 1 },
          rowVersion: { increment: 1 }
        }
      });

      if (count !== 1) {
        // BID-002 — losing this race does not always mean somebody else bid.
        // Two copies of the same retry get here together, and only one can
        // win. The update above waited on the winner's row lock, so by now
        // that transaction has committed and its bid is readable: if this
        // request id already has one, this is that same bid arriving twice.
        const winner = await tx.bid.findUnique({
          where: { clientRequestId: dto.clientRequestId },
          select: bidSelect
        });

        if (winner) {
          return { bid: replayOrRefuse(winner, auctionId, amount) };
        }

        throw new ConflictException(
          'Somebody bid first — reload and try again'
        );
      }

      const bid = await tx.bid.create({
        data: {
          auctionId,
          bidderId,
          amount,
          // The count read a moment ago plus this bid. The unique index on
          // (auctionId, sequenceNo) is what stops two bids sharing a number if
          // this is ever reached concurrently.
          sequenceNo: auction.bidCount + 1,
          clientRequestId: dto.clientRequestId,
          placedAt: now
        },
        select: bidSelect
      });

      await tx.auctionEvent.create({
        data: {
          auctionId,
          actorUserId: bidderId,
          bidId: bid.id,
          eventType: 'BID_PLACED'
        }
      });

      // BID-003 — read the auction back rather than assembling the payload from
      // what was written. Anything the same transaction changed and this code
      // forgot about would otherwise be broadcast stale; BID-004 is about to
      // change the end time here, and this stays correct without being touched.
      const updated = await tx.auction.findUniqueOrThrow({
        where: { id: auctionId },
        select: {
          id: true,
          currency: true,
          currentPrice: true,
          reservePrice: true,
          bidCount: true,
          currentEndAt: true,
          extensionCount: true
        }
      });

      return {
        bid: toOwnBid(bid),
        broadcast: toBidAcceptedEvent(updated, bid)
      };
    });
  }

  /**
   * BID-002 — reads back the bid that won the race on the unique index. It is
   * committed by the time the loser lands here, so this is a plain read.
   */
  private async replayExistingBid(
    clientRequestId: string,
    auctionId: string,
    amount: Prisma.Decimal
  ) {
    const existing = await this.prisma.bid.findUnique({
      where: { clientRequestId },
      select: bidSelect
    });

    // The row is gone again, which should not happen: the violation says it
    // was there. Refusing beats inventing an answer.
    if (!existing) {
      throw new ConflictException(
        'This bid could not be confirmed — try again'
      );
    }

    return replayOrRefuse(existing, auctionId, amount);
  }
}

/**
 * BID-002 — decides whether a repeated clientRequestId is a retry of the same
 * bid or a different bid wearing the same id.
 *
 * A retry gets its original result. Anything else is a caller reusing an id it
 * should not, and quietly returning the earlier bid would tell them their new
 * amount was accepted when it never was.
 */
function replayOrRefuse(
  existing: Prisma.BidGetPayload<{ select: typeof bidSelect }>,
  auctionId: string,
  amount: Prisma.Decimal
) {
  if (existing.auctionId !== auctionId) {
    throw new ConflictException(
      'This request id was already used on another auction'
    );
  }

  if (!existing.amount.equals(amount)) {
    throw new ConflictException(
      'This request id was already used for a different amount'
    );
  }

  return toOwnBid(existing);
}

/** True when Prisma refused a write because `column` already holds that value. */
function isUniqueViolation(error: unknown, column: string): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code !== 'P2002') return false;

  const target = error.meta?.target;

  // The target is usually the column list, but Prisma has been known to report
  // the constraint name instead, so both spellings are accepted.
  if (Array.isArray(target)) return target.includes(column);
  if (typeof target === 'string') return target.includes(column);

  return false;
}
