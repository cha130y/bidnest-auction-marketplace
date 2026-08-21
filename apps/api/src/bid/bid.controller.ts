import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { BidService } from './bid.service';
import { PlaceBidDto } from './dtos/place-bid.dto';

/**
 * BID-001 — bids live under the auction they belong to (SRS section 5.2), but
 * in their own controller: they have their own lifecycle and, shortly, their
 * own history and realtime routes.
 */
@Controller('auctions/:auctionId/bids')
export class BidController {
  constructor(private readonly bidService: BidService) {}

  // SRS 2 — admins moderate, they do not take part in the market
  @Roles('USER')
  @HttpCode(HttpStatus.CREATED)
  @Post()
  placeBid(
    @Param('auctionId', ParseUUIDPipe) auctionId: string,
    @CurrentUser('id') bidderId: string,
    @Body() dto: PlaceBidDto
  ) {
    return this.bidService.placeBid(auctionId, bidderId, dto);
  }
}
