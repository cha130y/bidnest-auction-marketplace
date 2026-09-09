import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { NegotiatorFacadeService } from './negotiator-facade.service';

/**
 * AI-003 — the agreed prices a buyer still owes on.
 *
 * Its own controller rather than a second route on OffersController, for the
 * reason that one is separate from Dev3's ProductController: the SRS pins
 * `POST /products/:id/offers` to a listing, and this is not about one listing.
 * It answers "what have I agreed to buy and not paid for", which is the same
 * question `GET /auctions/won` answers on the other half of the site.
 *
 * Everything it returns belongs to the caller — the buyer is taken from the
 * token, never from the request — so there is nothing here to authorise beyond
 * being signed in.
 */
@Controller('offers')
export class PendingOffersController {
  constructor(private readonly negotiatorFacade: NegotiatorFacadeService) {}

  @Get('pending')
  listPending(@CurrentUser('id') buyerId: string) {
    return this.negotiatorFacade.listPayableOffers(buyerId);
  }
}
