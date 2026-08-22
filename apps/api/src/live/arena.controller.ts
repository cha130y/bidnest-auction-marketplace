import { Controller, Get, Param, ParseUUIDPipe, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { LiveService } from './live.service';

/**
 * LIV-002 — the arena, the screen people watch while an auction runs.
 *
 * Its own route rather than a flag on the lobby: the two screens are different
 * enough that a client asks for one or the other, and the arena costs two
 * queries the lobby has no use for.
 */
@Controller('auctions/:auctionId/arena')
export class ArenaController {
  constructor(private readonly liveService: LiveService) {}

  /**
   * Public, like the auction itself (AUC-005) — a signed-out visitor watches
   * the bidding and is told bidding is not open to them by `you` being null. A
   * token is honoured when sent, which is what fills in whether the viewer may
   * bid and which bids are theirs.
   */
  @Public()
  @Get()
  getArena(
    @Param('auctionId', ParseUUIDPipe) auctionId: string,
    @Req() request: Request
  ) {
    return this.liveService.getArena(auctionId, request.user);
  }
}
