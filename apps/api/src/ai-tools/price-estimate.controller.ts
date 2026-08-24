import { Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PriceEstimatorService } from './price-estimator.service';

/**
 * AI-002 — AI Price Estimator (Optional, owner: Dev 5)
 *
 * Separate controller rather than a new method on Dev4's AuctionController —
 * same path prefix, no shared file to conflict on. Nest allows two
 * controllers to share a route prefix as long as the full method+path pairs
 * don't collide.
 *
 * AccessTokenGuard/RolesGuard/ThrottlerGuard are all global APP_GUARDs now
 * (see app.module.ts) — @Throttle here overrides the blanket per-IP limit for
 * this route only, no @UseGuards needed (adding it back runs the guard twice
 * per request, halving the effective limit — reproduced this for real while
 * testing and confirmed the fix against SupportChatController's own comment
 * saying the same thing).
 */
@Controller('auctions/drafts')
export class PriceEstimateController {
  constructor(private readonly priceEstimator: PriceEstimatorService) {}

  @Throttle({ default: { limit: 3, ttl: 600_000 } })
  @Post(':id/price-estimate')
  estimate(
    @Param('id', ParseUUIDPipe) auctionId: string,
    @CurrentUser('id') sellerId: string
  ) {
    return this.priceEstimator.estimate(auctionId, sellerId);
  }
}
