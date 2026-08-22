import { Controller, Get, Param, ParseUUIDPipe, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { LiveService } from './live.service';

/**
 * LIV-001 — the lobby: one read that answers everything the screen before an
 * auction starts has to show.
 *
 * It could have been assembled on the client from the auction read plus a
 * participant count, but then the countdown would be measured against three
 * different responses that arrived at three different moments. One read gives
 * the screen a single consistent instant to draw.
 */
@Controller('auctions/:auctionId/lobby')
export class LobbyController {
  constructor(private readonly liveService: LiveService) {}

  /**
   * Public, like the auction it describes (AUC-005) — somebody deciding
   * whether to sign up can see the auction and how busy it is. A token is
   * honoured when sent, which is the only way `you` can be filled in;
   * `@CurrentUser()` cannot be used here because it throws when nobody is
   * signed in.
   */
  @Public()
  @Get()
  getLobby(
    @Param('auctionId', ParseUUIDPipe) auctionId: string,
    @Req() request: Request
  ) {
    return this.liveService.getLobby(auctionId, request.user?.id);
  }
}
