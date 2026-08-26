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

  /**
   * Just the number, for the heart in the header.
   *
   * Its own route rather than a flag on the list: the header is on every page,
   * and reading the count off the list meant fetching a hundred rows to render
   * one integer. Mirrors `GET /notifications/unread-count`, which the same
   * header already calls for the same reason.
   *
   * This controller has no parameterised routes, so `count` cannot be read as
   * an id — but it is declared next to the list anyway, since that is where
   * anyone adding one would look.
   */
  @Roles('USER')
  @Get('count')
  countOwn(@CurrentUser('id') userId: string) {
    return this.watchlist.countOwn(userId);
  }
}
