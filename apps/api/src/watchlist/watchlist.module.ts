import { Module } from '@nestjs/common';
import { AuctionWatchlistController } from './auction-watchlist.controller';
import { WatchlistController } from './watchlist.controller';
import { WatchlistService } from './watchlist.service';

/**
 * WAT-001 / WAT-002 — following auctions.
 *
 * Its own module rather than part of AuctionModule or LiveModule: a watchlist
 * belongs to a person, not to an auction, and it outlives any one auction's
 * lifecycle. It borrows the auction and result mappers so a watched row
 * describes an auction exactly as every other read does.
 */
@Module({
  controllers: [WatchlistController, AuctionWatchlistController],
  providers: [WatchlistService],
  exports: [WatchlistService]
})
export class WatchlistModule {}
