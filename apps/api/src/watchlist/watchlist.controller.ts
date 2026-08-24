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
}
