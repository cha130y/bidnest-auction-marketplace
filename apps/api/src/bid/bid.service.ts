import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { bidSelect, toOwnBid } from './bid.mapper';
import { PlaceBidDto } from './dtos/place-bid.dto';
import { calculateMinimumBid } from './utils/calculate-minimum-bid.util';

@Injectable()
export class BidService {
  constructor(private readonly prisma: PrismaService) {}

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

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.bid.findUnique({
        where: { clientRequestId: dto.clientRequestId },
        select: { id: true }
      });

      // BID-002 will turn this into a replay of the original result. Refusing
      // it is already enough to stop a retry being counted twice.
      if (existing) {
        throw new ConflictException('This bid has already been placed');
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

      return toOwnBid(bid);
    });
  }
}
