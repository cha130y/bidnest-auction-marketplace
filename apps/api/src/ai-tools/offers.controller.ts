import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateOfferDto } from './dtos/create-offer.dto';
import { NegotiatorFacadeService } from './negotiator-facade.service';

/**
 * AI-003 — AI Negotiator (Optional, owner: Dev 5)
 *
 * Path matches SRS §5.2 exactly: POST /products/:id/offers. Separate
 * controller from Dev3's ProductController — same reasoning as
 * PriceEstimateController for AI-002 (shared prefix, no shared file).
 *
 * ThrottlerGuard is a global APP_GUARD (see app.module.ts) — no @UseGuards
 * needed here, @Throttle alone overrides the limit for this route.
 */
@Controller('products')
export class OffersController {
  constructor(private readonly negotiatorFacade: NegotiatorFacadeService) {}

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post(':id/offers')
  createOffer(
    @Param('id', ParseUUIDPipe) productId: string,
    @CurrentUser('id') buyerId: string,
    @Body() dto: CreateOfferDto
  ) {
    return this.negotiatorFacade.negotiate(
      productId,
      buyerId,
      dto.quantity,
      dto.offerAmount
    );
  }
}
