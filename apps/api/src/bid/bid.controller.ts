import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req
} from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { BidService } from './bid.service';
import { ListBidHistoryDto } from './dtos/list-bid-history.dto';
import { PlaceBidDto } from './dtos/place-bid.dto';

/**
 * Bids live under the auction they belong to (SRS section 5.2), in their own
 * controller: placing one and reading the history are different acts with
 * different audiences.
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

  /**
   * BID-005 — the bid history, public like the auction it belongs to. A token
   * is honoured when sent, which is what lets a bidder see which rows are
   * theirs; `@CurrentUser()` cannot be used here because it throws when nobody
   * is signed in.
   */
  @Public()
  @Get()
  listBidHistory(
    @Param('auctionId', ParseUUIDPipe) auctionId: string,
    @Query() dto: ListBidHistoryDto,
    @Req() request: Request
  ) {
    return this.bidService.listBidHistory(auctionId, dto, request.user?.id);
  }
}
