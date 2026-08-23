import {
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { WatchlistService } from './watchlist.service';

/**
 * WAT-001 — following one auction, and unfollowing it. Under the auction it
 * acts on, the way participants are (LIV-001), because that is what the request
 * is about; the list itself lives at `/watchlist`.
 *
 * One auction per request, which is the criterion's "ครั้งละ 1 รายการ": there
 * is no endpoint that takes a list, so a client cannot half-succeed at adding
 * five and have to work out which ones landed.
 */
@Controller('auctions/:auctionId/watchlist')
export class AuctionWatchlistController {
  constructor(private readonly watchlistService: WatchlistService) {}

  /**
   * 200 rather than the POST default of 201: watching is idempotent, so a
   * second call creates nothing, and answering 201 would claim it had.
   */
  @Roles('USER')
  @HttpCode(HttpStatus.OK)
  @Post()
  watch(
    @Param('auctionId', ParseUUIDPipe) auctionId: string,
    @CurrentUser('id') userId: string
  ) {
    return this.watchlistService.watch(auctionId, userId);
  }

  /**
   * 200 with a body rather than 204: the answer says whether a row was
   * actually removed, which a screen can use to tell "unfollowed" from
   * "already gone" without asking again.
   */
  @Roles('USER')
  @HttpCode(HttpStatus.OK)
  @Delete()
  unwatch(
    @Param('auctionId', ParseUUIDPipe) auctionId: string,
    @CurrentUser('id') userId: string
  ) {
    return this.watchlistService.unwatch(auctionId, userId);
  }
}
