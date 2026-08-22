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
import { LiveService } from './live.service';

/**
 * LIV-001 — taking part in an auction. Its own path rather than a corner of
 * the lobby, because participation outlives the lobby: the same row is what
 * the arena counts once bidding opens.
 */
@Controller('auctions/:auctionId/participants')
export class ParticipantController {
  constructor(private readonly liveService: LiveService) {}

  // SRS 2 — admins moderate the marketplace, they do not take part in it
  @Roles('USER')
  @HttpCode(HttpStatus.OK)
  @Post()
  join(
    @Param('auctionId', ParseUUIDPipe) auctionId: string,
    @CurrentUser('id') userId: string
  ) {
    return this.liveService.join(auctionId, userId);
  }

  /**
   * Leaving is idempotent, and there is no participant resource at a URL of
   * its own to delete — so this answers 200 with the new count rather than the
   * usual 204, which would leave the screen having to ask for it separately.
   */
  @Roles('USER')
  @HttpCode(HttpStatus.OK)
  @Delete()
  leave(
    @Param('auctionId', ParseUUIDPipe) auctionId: string,
    @CurrentUser('id') userId: string
  ) {
    return this.liveService.leave(auctionId, userId);
  }
}
