import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ReturnsOwnerFields } from '../common/decorators/owner-fields.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ListWatchlistDto } from './dtos/list-watchlist.dto';
import { WatchlistService } from './watchlist.service';

/**
 * WAT-002 — the caller's own watchlist. Not under `/auctions` because it is
 * not about one auction: it is the list of everything this person is following.
 */
@Controller('watchlist')
export class WatchlistController {
  constructor(private readonly watchlistService: WatchlistService) {}

  // SRS 2 — admins moderate the marketplace, they do not shop in it
  @Roles('USER')
  @ReturnsOwnerFields()
  @Get()
  listOwn(@CurrentUser('id') userId: string, @Query() dto: ListWatchlistDto) {
    return this.watchlistService.listOwn(userId, dto);
  }

  /**
   * Just the number, for the heart in the header.
   *
   * Its own route rather than a flag on the list: the header is on every page,
   * and reading the count off the list meant fetching a hundred rows to render
   * one integer. Mirrors `GET /notifications/unread-count`, which the same
   * header already calls for the same reason.
   *
   * No `@ReturnsOwnerFields()`: a count is a count either way, and the
   * decorator exists to let owner-only fields through on rows there are none
   * of here.
   */
  @Roles('USER')
  @Get('count')
  countOwn(@CurrentUser('id') userId: string) {
    return this.watchlistService.countOwn(userId);
  }
}
