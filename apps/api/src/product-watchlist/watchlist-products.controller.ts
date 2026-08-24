import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ListProductWatchlistDto } from './dtos/list-product-watchlist.dto';
import { ProductWatchlistService } from './product-watchlist.service';

/**
 * The caller's followed listings.
 *
 * A sibling of `GET /watchlist` rather than a branch of it: the screen shows
 * the two lists side by side, but they are separate tables with separate
 * shapes, and one endpoint returning a mixture would have to invent a type
 * discriminator for a client that already knows which tab it is drawing.
 *
 * Under `/watchlist/` and not `/products/watchlist` because it is not about a
 * product — and because Nest would read the word "watchlist" as an id and hand
 * it to `ParseUUIDPipe`, the same trap `/products/mine` sits above.
 */
@Controller('watchlist/products')
export class WatchlistProductsController {
  constructor(private readonly watchlist: ProductWatchlistService) {}

  // SRS 2 — admins moderate the marketplace, they do not shop in it
  @Roles('USER')
  @Get()
  listOwn(
    @CurrentUser('id') userId: string,
    @Query() dto: ListProductWatchlistDto
  ) {
    return this.watchlist.listOwn(userId, dto);
  }
}
