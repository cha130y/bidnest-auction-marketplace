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
import { ProductWatchlistService } from './product-watchlist.service';

/**
 * Following one listing, and unfollowing it. Under the listing it acts on, the
 * way the auction side sits under its auction; the list itself lives at
 * `/watchlist/products`.
 *
 * One listing per request. There is no endpoint that takes a list, so a client
 * cannot half-succeed at adding five and have to work out which ones landed.
 */
@Controller('products/:productId/watchlist')
export class ProductWatchlistController {
  constructor(private readonly watchlist: ProductWatchlistService) {}

  /**
   * 200 rather than the POST default of 201: following is idempotent, so a
   * second call creates nothing, and answering 201 would claim it had.
   */
  // SRS 2 — admins moderate the marketplace, they do not shop in it
  @Roles('USER')
  @HttpCode(HttpStatus.OK)
  @Post()
  watch(
    @Param('productId', ParseUUIDPipe) productId: string,
    @CurrentUser('id') userId: string
  ) {
    return this.watchlist.watch(productId, userId);
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
    @Param('productId', ParseUUIDPipe) productId: string,
    @CurrentUser('id') userId: string
  ) {
    return this.watchlist.unwatch(productId, userId);
  }
}
